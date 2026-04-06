import { google } from 'googleapis';
import dotenv from 'dotenv';
const dotenvResult = await (async () => {
    const { dirname, join } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const { config } = await import('dotenv');
    return config({ path: join(__dirname, '../.env.local') });
})();

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function check() {
  const res = await sheets.spreadsheets.values.get({ 
    spreadsheetId: SHEET_ID, 
    range: 'RANKING_DAILY!A1:E11' 
  });
  console.table(res.data.values);
}
check();
