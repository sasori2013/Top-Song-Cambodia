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

async function checkDebugLogs() {
  console.log('Checking DEBUG_LOG for activity...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'DEBUG_LOG!A:B',
  });
  const rows = res.data.values || [];
  
  console.log(`Total log entries: ${rows.length}`);
  
  // Filter by date for yesterday (2026/04/02)
  const yesterdayLogs = rows.filter(r => String(r[0]).includes('2026/04/02'));
  console.log(`Found ${yesterdayLogs.length} entries from yesterday.`);
  
  yesterdayLogs.forEach(r => {
    const time = String(r[0]);
    if (time.includes('18:') || time.includes('19:') || time.includes('20:')) {
      console.log(`${r[0]} | ${r[1]}`);
    }
  });
}

checkDebugLogs().catch(console.error);
