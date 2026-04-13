import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function checkSheet() {
  const res = await sheets.spreadsheets.values.get({ 
      spreadsheetId: SHEET_ID, 
      range: 'RANKING_DAILY!A1:E2'
  });
  console.log(JSON.stringify(res.data.values, null, 2));
}

checkSheet().catch(console.error);
