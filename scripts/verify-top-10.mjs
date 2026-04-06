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

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function verify() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RANKING_DAILY!A1:Z11' });
  const rows = res.data.values || [];
  console.table(rows.map(r => ({
      Rank: r[1],
      Prev: r[2],
      Artist: r[3],
      Title: r[4],
      Score: r[13],
      Growth: r[15],
      Views: r[20],
      BaseV: r[21]
  })));
}
verify();
