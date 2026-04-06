import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function checkNewSongs() {
  console.log('Checking recent additions to SONGS sheet...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SONGS!A:D',
  });
  const rows = res.data.values || [];
  
  // Sort by publishedAt to see recent ones
  const songs = rows.slice(1).map(r => ({
    id: r[0],
    artist: r[1],
    title: r[2],
    publishedAt: r[3]
  }));

  songs.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  console.log('--- Top 10 Recent Songs in SONGS ---');
  songs.slice(0, 10).forEach(s => {
    console.log(`${s.publishedAt} | ${s.artist} | ${s.title}`);
  });
}

checkNewSongs().catch(console.error);
