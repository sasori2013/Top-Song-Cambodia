import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { writeFileSync, unlinkSync } from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'artists_master';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function syncArtistsMaster() {
  console.log('--- Synchronizing Artists Master (Sheets -> BigQuery) ---');

  // 1. Fetch all data from Artists sheet (Rows A to L)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A2:L',
  });
  const rows = res.data.values || [];
  console.log(`Fetched ${rows.length} artists from Sheets.`);

  // 2. Map rows to BigQuery objects
  const bqRows = rows.map(r => {
    return {
      name: r[0] || null,
      type: r[1] || 'Artist', // Default to Artist if blank
      channelId: r[2] || null,
      subscribers: r[3] ? parseInt(String(r[3]).replace(/,/g, '')) || 0 : 0,
      facebook: r[4] || null,
      productionName: r[5] || null,
      lastSync: r[6] || null,
      // H is Deep Search (boolean-like), we skip it for metadata if not needed, 
      // but let's map the metadata starting from I (index 8)
      bio: r[8] || null,
      genres: r[9] || null,
      links: r[10] || null,
      artistInfo: r[11] || null,
      lastUpdated: new Date().toISOString()
    };
  }).filter(a => a.name); // Filter out empty rows

  if (bqRows.length === 0) {
    console.log('No artist data to sync.');
    return;
  }

  // 3. Load into BigQuery (Overwrite mode)
  console.log(`Loading ${bqRows.length} rows into bigquery.${DATASET_ID}.${TABLE_ID}...`);
  
  const tempFilePath = join(__dirname, '../tmp-artists.jsonl');
  writeFileSync(tempFilePath, bqRows.map(r => JSON.stringify(r)).join('\n'));

  try {
    await bq.dataset(DATASET_ID).table(TABLE_ID).load(tempFilePath, {
      format: 'json',
      writeDisposition: 'WRITE_TRUNCATE',
      sourceFormat: 'NEWLINE_DELIMITED_JSON'
    });
    console.log('Successfully synchronized artists metadata.');
  } catch (error) {
    console.error('Error during BigQuery sync:', error.message);
  } finally {
    try {
      unlinkSync(tempFilePath);
    } catch (e) {}
  }
}

syncArtistsMaster().catch(console.error);
