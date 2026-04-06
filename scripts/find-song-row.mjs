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

async function findSongRow(videoId) {
  try {
    const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A:D' });
    const resSongsLong = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A:D' });
    
    const rows = resSongs.data.values || [];
    const rowsLong = resSongsLong.data.values || [];

    const rowIndex = rows.findIndex(r => r[0] === videoId);
    if (rowIndex !== -1) {
        console.log(`Video ID ${videoId} found in SONGS sheet at row ${rowIndex + 1}`);
        console.log(`Content: ${JSON.stringify(rows[rowIndex])}`);
        return;
    }

    const rowIndexLong = rowsLong.findIndex(r => r[0] === videoId);
    if (rowIndexLong !== -1) {
        console.log(`Video ID ${videoId} found in SONGS_LONG sheet at row ${rowIndexLong + 1}`);
        console.log(`Content: ${JSON.stringify(rowsLong[rowIndexLong])}`);
        return;
    }

    console.log(`Video ID ${videoId} not found in either sheet.`);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

findSongRow('dryShmzXrgo');
