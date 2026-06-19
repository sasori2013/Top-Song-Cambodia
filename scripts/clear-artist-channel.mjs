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

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// Artists to clear channelId for (column C)
const TARGET_ARTISTS = ['Chhay Vireak Yuth', 'AK-K'];

async function main() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:C' });
  const rows = res.data.values || [];

  const clears = [];
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i][0];
    const channelId = rows[i][2];
    if (TARGET_ARTISTS.includes(name)) {
      const rowNum = i + 2; // 1-based + header
      console.log(`Found: "${name}" at row ${rowNum}, channelId=${channelId}`);
      clears.push({ range: `Artists!C${rowNum}`, values: [['']] });
    }
  }

  if (clears.length === 0) {
    console.log('No matching artists found.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: clears }
  });

  console.log(`✅ Cleared channelId for ${clears.length} artist(s): ${TARGET_ARTISTS.join(', ')}`);
}

main().catch(console.error);
