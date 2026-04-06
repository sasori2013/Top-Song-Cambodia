import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

async function investigate() {
  console.log('--- Investigating Ranking & Artists ---');
  
  // 1. Get Ranking Daily Row 2 (Rank 1)
  const resRank = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RANKING_DAILY!A2:O2' });
  const rank1 = resRank.data.values?.[0];
  console.log('Rank 1 on Sheet:', rank1 ? `${rank1[1]} - ${rank1[3]} - ${rank1[4]}` : 'NOT FOUND');

  // 2. Check if "cambo rapper" exists in Artists sheet
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A:C' });
  const artistRows = resArtists.data.values || [];
  const foundInArtists = artistRows.some(r => r[0] && r[0].toLowerCase().includes('cambo rapper'));
  console.log('Artist "cambo rapper" in Artists sheet:', foundInArtists ? 'YES' : 'NO');
  
  // 3. Search for "cambo rapper" in SONGS sheet
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A:B' });
  const songRows = resSongs.data.values || [];
  const songsForCambo = songRows.filter(r => r[1] && r[1].toLowerCase().includes('cambo rapper'));
  console.log(`Songs for "cambo rapper" in SONGS sheet: ${songsForCambo.length} found.`);
  if (songsForCambo.length > 0) {
      console.log('Sample Song:', songsForCambo[0]);
  }
}

investigate();
