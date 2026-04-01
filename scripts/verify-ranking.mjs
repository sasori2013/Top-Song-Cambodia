import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function verify() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RANKING_DAILY!A1:R10' });
  const rows = res.data.values || [];
  console.table(rows.map(r => ({
      Rank: r[1],
      Artist: r[3],
      Score: r[13],
      DailyV: r[17]
  })));
}

verify().catch(console.error);
