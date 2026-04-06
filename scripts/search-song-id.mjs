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

async function searchSong(videoId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'SONGS!A:A',
    });
    const resLong = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'SONGS_LONG!A:A',
    });
    const ids = (res.data.values || []).flat();
    const idsLong = (resLong.data.values || []).flat();
    const found = ids.includes(videoId) || idsLong.includes(videoId);
    console.log(`Video ID ${videoId}: ${found ? 'FOUND' : 'NOT FOUND'} in SONGS or SONGS_LONG sheet.`);
  } catch (e) {
    console.error('Error searching song:', e.message);
  }
}

searchSong('dryShmzXrgo'); // VannDa - BACK HOME
