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

async function checkArtists() {
  console.log('Checking artists for failures...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A2:H',
  });
  const rows = res.data.values || [];
  
  const now = new Date('2026-04-03T10:20:57+09:00');
  const targetDateStr = '2026-04-02'; // Looking for people who didn't sync yesterday
  
  const failures = [];
  rows.forEach((row, index) => {
    const name = row[0];
    const channelId = row[2];
    const lastSync = row[6];
    
    if (!name || !channelId) return;
    
    // If lastSync is missing or not from 2026-04-02
    if (!lastSync || !lastSync.includes('2026-04-02')) {
      failures.push({ name, channelId, lastSync, row: index + 2 });
    }
  });

  console.log('--- Potential Failures (Sync Date != 2026-04-02) ---');
  failures.forEach(f => {
    console.log(`Row ${f.row}: ${f.name} (ID: ${f.channelId}) | Last Sync: ${f.lastSync || 'Never'}`);
  });
}

checkArtists().catch(console.error);
