import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_HISTORY = 'rank_history';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function restoreHistory() {
  console.log('--- Restoring Ranking History from BigQuery ---');

  // 1. Get History from BQ (3/31 and 4/1)
  const sql = `
    SELECT 
      FORMAT_DATE('%Y-%m-%d', date) as date_str,
      videoId,
      type,
      rank,
      heatScore
    FROM \`${DATASET_ID}.${TABLE_HISTORY}\`
    WHERE date >= '2026-03-31'
    ORDER BY date ASC, rank ASC
  `;
  const [rows] = await bq.query(sql);
  console.log(`Fetched ${rows.length} records from BigQuery.`);

  if (rows.length === 0) {
    console.log('No data to restore.');
    return;
  }

  // 2. Prepare Sheet Data (date, videoId, type, rank, heatScore)
  const values = rows.map(r => [
    r.date_str,
    r.videoId,
    r.type,
    r.rank,
    r.heatScore
  ]);

  // 3. Check/Append to Sheet
  // Headers (A1:E1) if empty
  const resHeader = await sheets.spreadsheets.values.get({ 
      spreadsheetId: SHEET_ID, 
      range: 'RANK_HISTORY!A1:E1' 
  });
  if (!resHeader.data.values || resHeader.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: 'RANK_HISTORY!A1:E1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['date', 'videoId', 'type', 'rank', 'heatScore']] }
      });
      console.log('Added headers to RANK_HISTORY.');
  }

  // Append records
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'RANK_HISTORY!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log(`Successfully restored ${rows.length} rows to RANK_HISTORY sheet.`);
}

restoreHistory().catch(console.error);
