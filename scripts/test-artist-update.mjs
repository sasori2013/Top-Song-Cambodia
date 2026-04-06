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
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function testArtistUpdate() {
  console.log('Testing lastSync update for VannDa (Row 2)...');
  const today = new Date().toISOString().split('T')[0];
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Artists!G2',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[today]] },
  });
  
  console.log('Update successful!');
}

testArtistUpdate().catch(console.error);
