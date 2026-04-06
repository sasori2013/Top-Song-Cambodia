import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function verify() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RANKING_DAILY!A1:Z5' });
  const rows = res.data.values || [];
  if (rows.length < 2) {
      console.log('No data found in RANKING_DAILY.');
      return;
  }
  
  console.log('Header Row:', rows[0].join(' | '));
  console.log('\n--- Rank 1 (Today) ---');
  const r1 = rows[1];
  console.log(`Rank: ${r1[1]}`);
  console.log(`Prev Rank: ${r1[2]}`);
  console.log(`Artist: ${r1[3]}`);
  console.log(`Title: ${r1[4]}`);
  console.log(`Heat Score: ${r1[13]}`);
  console.log(`Growth: ${r1[15]}`);
  console.log(`Views: ${r1[20]}`);
  console.log(`Base Views: ${r1[21]}`);
  
  if (r1[2] === '-' || r1[15] === '0%') {
      console.warn('\n⚠️ WARNING: Metrics are still missing or 0%!');
  } else {
      console.log('\n✅ Metrics look healthy (Previous Rank and Growth populated).');
  }
}
verify();
