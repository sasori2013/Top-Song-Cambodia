import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const REMOVE_KEYWORDS = [
  '#shorts', 'streaming', 'A DAY in', 'Comment', 'vlog', '#clips', 
  'Remove Dreadlock', 'building my dream room', 'EP2', ' studio ', 
  ' ដំណឹងថ្មី ', ' មកច្រើនពេក ', ' ឡើងធ្វើ MC ', ' យប់នេះ បទថ្មីចេញ'
];

async function cleanup() {
  console.log('--- Cleaning up Vin Vitou Non-Music Content ---');

  // 1. Fetch all Vin Vitou songs from BQ
  const [rows] = await bq.query(`SELECT videoId, title FROM \`heat_ranking.songs_master\` WHERE artist = 'Vin Vitou'`);
  
  const toDelete = rows.filter(r => {
    const t = r.title.toLowerCase();
    return REMOVE_KEYWORDS.some(kw => t.includes(kw.toLowerCase()));
  });

  console.log(`  Found ${toDelete.length} noisy videos out of ${rows.length}.`);

  if (toDelete.length === 0) {
    console.log('  No noisy videos found.');
    return;
  }

  const ids = toDelete.map(r => r.videoId);
  console.log('  IDs to delete: ' + ids.join(', '));

  // 2. Delete from BigQuery
  const deleteQuery = `DELETE FROM \`heat_ranking.songs_master\` WHERE videoId IN UNNEST([${ids.map(id => `'${id}'`).join(',')}])`;
  await bq.query(deleteQuery);
  console.log('  Deleted from BigQuery.');

  // 3. Delete from Sheets (SONGS and SONGS_LONG)
  const sheetsToFix = ['SONGS', 'SONGS_LONG'];
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });

  for (const sName of sheetsToFix) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sName}!A:A` });
    const allIds = (res.data.values || []).flat();
    const sheetId = spreadsheet.data.sheets.find(s => s.properties.title === sName).properties.sheetId;
    
    // Collect indices to delete (in reverse order to avoid index shift issues)
    const indicesToDelete = [];
    ids.forEach(id => {
      let idx = -1;
      while ((idx = allIds.indexOf(id, idx + 1)) !== -1) {
        indicesToDelete.push(idx);
      }
    });
    
    indicesToDelete.sort((a, b) => b - a);

    if (indicesToDelete.length > 0) {
      console.log(`  Deleting ${indicesToDelete.length} rows from ${sName}...`);
      const requests = indicesToDelete.map(idx => ({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: idx,
            endIndex: idx + 1
          }
        }
      }));

      // Send in batches of 50 to avoid payload limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < requests.length; i += BATCH_SIZE) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: requests.slice(i, i + BATCH_SIZE) }
        });
      }
    }
  }

  console.log('--- Cleanup Complete ---');
}

cleanup().catch(console.error);
