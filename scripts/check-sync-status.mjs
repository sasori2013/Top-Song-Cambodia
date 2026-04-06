import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function checkSync() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A:G',
  });
  const rows = res.data.values || [];
  const headers = rows[0];
  console.log('Headers:', headers);
  
  const artistsWithoutSync = rows.slice(1).filter(r => !r[6] || r[6].trim() === '');
  console.log(`Artists without lastSync (G): ${artistsWithoutSync.length}`);
  if (artistsWithoutSync.length > 0) {
    console.log('Sample:', artistsWithoutSync[0][0]);
  }
}

checkSync().catch(console.error);
