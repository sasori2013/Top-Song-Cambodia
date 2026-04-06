import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function updateSongHeaders() {
  console.log('Updating SONGS and SONGS_LONG sheet headers for labeling...');
  
  const newHeaders = ['Event Tag', 'Category'];

  // Update SONGS!E1:F1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'SONGS!E1:F1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newHeaders] }
  });

  // Update SONGS_LONG!E1:F1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'SONGS_LONG!E1:F1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newHeaders] }
  });

  console.log('Successfully added labeling columns to SONGS and SONGS_LONG sheets.');
}

updateSongHeaders().catch(console.error);
