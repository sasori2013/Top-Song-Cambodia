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

async function checkArtists() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Artists!A2:H',
    });
    const rows = res.data.values || [];
    console.log(`Total artists: ${rows.length}`);
    console.log('Sample artists (Name, ID, isDeepSearch):');
    rows.slice(0, 10).forEach(r => console.log(`${r[0]}, ${r[2]}, ${r[7]}`));
  } catch (e) {
    console.error('Error reading artists:', e.message);
  }
}

checkArtists();
