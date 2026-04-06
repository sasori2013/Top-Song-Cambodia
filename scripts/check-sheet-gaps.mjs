import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function checkSheet() {
  const spreadsheetId = process.env.NEXT_PUBLIC_SHEET_ID;
  console.log('Checking Spreadsheet:', spreadsheetId);
  
  const res = await sheets.spreadsheets.values.get({ 
    spreadsheetId,
    range: 'SNAPSHOT!A:A' 
  });
  
  const dates = (res.data.values || []).flat();
  const dateSet = new Set(dates);
  
  console.log('Total rows in SNAPSHOT sheet:', dates.length);
  console.log('Does 2026-03-19 exist?', dateSet.has('2026-03-19'));
  console.log('Does 2026-03-28 exist?', dateSet.has('2026-03-28'));
}
checkSheet().catch(console.error);
