import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function verifyFixes() {
  console.log('--- Fetching Fixed Artists from BigQuery ---');
  const [bqRows] = await bq.query(`
    SELECT videoId, title, artist as fixedArtist, classificationSource
    FROM \`${DATASET_ID}.songs_master\`
    WHERE classificationSource = 'ARTIST_FIXED'
    ORDER BY videoId
  `);
  console.log(`Found ${bqRows.length} fixed songs in BigQuery.`);

  console.log('--- Fetching Original Artists from Google Sheets ---');
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:B' });
  const resSongsLong = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A2:B' });
  
  const originalData = new Map();
  [...(resSongs.data.values || []), ...(resSongsLong.data.values || [])].forEach(r => {
    if (r[0]) originalData.set(r[0], r[1]); // videoId -> artist
  });
  console.log(`Loaded ${originalData.size} songs from Sheets.`);

  console.log('\n--- Comparison Results ---');
  const comparisons = bqRows.map(row => {
    const originalArtist = originalData.get(row.videoId) || 'NOT_FOUND_IN_SHEET';
    return {
      videoId: row.videoId,
      title: row.title.substring(0, 40),
      original: originalArtist,
      fixed: row.fixedArtist,
      match: originalArtist === row.fixedArtist ? '✅' : (row.fixedArtist === '{}' ? '❌ BUG' : '🔄 CHANGED')
    };
  });

  console.table(comparisons.slice(0, 50)); // Show top 50
  
  const bugCount = comparisons.filter(c => c.fixed === '{}').length;
  const changedCount = comparisons.filter(c => c.match === '🔄 CHANGED').length;
  
  console.log(`\nSummary:`);
  console.log(`Total Fixed: ${comparisons.length}`);
  console.log(`Actually Changed: ${changedCount}`);
  console.log(`Bugs (set to {}): ${bugCount}`);
  
  if (bugCount > 0) {
    console.log('\n⚠️ detected some entries were set to "{}" (empty object string). This is likely a bug in the AI response parsing.');
  }
}

verifyFixes().catch(console.error);
