import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetIds() {
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    const sheetsProp = res.data.sheets || [];
    sheetsProp.forEach(s => {
      console.log(`Title: ${s.properties.title}, SheetId: ${s.properties.sheetId}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
}

getSheetIds();
