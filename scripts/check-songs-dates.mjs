import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

// Get SONGS data for Galaxy Navatra
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
  range: 'SONGS!A2:D20'
});
const rows = res.data.values || [];
console.log('SONGS sheet sample (videoId, artist, title, publishedAt):');
rows.filter(r => r[1]?.includes('Galaxy') || r[1]?.includes('Norith')).forEach(r => {
  console.log(r);
});
console.log('\nFirst 5 rows:');
rows.slice(0, 5).forEach(r => console.log(r));
