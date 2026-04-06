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

async function updateHeaders() {
  console.log('Updating Artists sheet headers...');
  
  // New headers starting from Column I (index 8)
  const newHeaders = [
    'Bio (略歴)',
    'Genres (ジャンル)',
    'Links (SNS・サイト)',
    'ArtistInfo (詳細・背景)'
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Artists!I1:L1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [newHeaders]
    }
  });

  console.log('Successfully added metadata columns (I-L) to Artists sheet.');
}

updateHeaders().catch(console.error);
