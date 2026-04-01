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

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
  range: 'RANKING_DAILY!A1:R3'
});
const rows = res.data.values || [];
rows.forEach((r, i) => console.log(`Row ${i}:`, JSON.stringify(r)));
