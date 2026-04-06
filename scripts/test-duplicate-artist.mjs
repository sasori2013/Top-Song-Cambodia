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

async function append() {
    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Artists!A:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['VannDa Duplicate', 'https://youtube.com/channel/UCrmidtzX3ZPVxYRjTI6V6tA', 'UCrmidtzX3ZPVxYRjTI6V6tA']] }
    });
    console.log('Duplicate artist appended.');
}
append();
