import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function patch() {
  console.log('--- Patching Ranking Sheets Artist Names ---');

  // 1. Create Title -> Artist Map from BigQuery
  console.log('  Fetching correct metadata from BigQuery...');
  const [songs] = await bq.query('SELECT title, artist FROM `heat_ranking.songs_master`');
  const titleMap = new Map();
  songs.forEach(s => {
    // Only map if artist is NOT 'Gala'
    if (s.artist !== 'Gala') {
      titleMap.set(s.title, s.artist);
    }
  });
  console.log(`  Map created with ${titleMap.size} titles.`);

  // 2. Process Sheets
  const sheetsToPatch = ['RANKING_DAILY', 'RANK_HISTORY', 'RANKING_WEEKLY'];
  
  for (const sName of sheetsToPatch) {
    console.log(`  Processing ${sName}...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sName}!A:H` });
    const rows = res.data.values;
    if (!rows || rows.length === 0) continue;

    const updates = [];
    // Assuming Artist is in Col 3 (D) and Title is in Col 4 (E)
    // Check header to be sure
    const header = rows[0];
    const artistIdx = header.indexOf('アーティスト');
    const titleIdx = header.indexOf('曲名');
    
    if (artistIdx === -1 || titleIdx === -1) {
      console.warn(`    Skipping ${sName}: Columns not found.`);
      continue;
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const currentArtist = row[artistIdx];
      const title = row[titleIdx];

      if (currentArtist === 'Gala' || (currentArtist || '').toLowerCase().includes('gala')) {
        const correctArtist = titleMap.get(title);
        if (correctArtist && correctArtist !== currentArtist) {
          updates.push({
            range: `${sName}!${String.fromCharCode(65 + artistIdx)}${i + 1}`,
            values: [[correctArtist]]
          });
        }
      }
    }

    if (updates.length > 0) {
      console.log(`    Applying ${updates.length} updates to ${sName}...`);
      // Chunk updates to avoid payload limits
      const CHUNK_SIZE = 500;
      for (let j = 0; j < updates.length; j += CHUNK_SIZE) {
        const chunk = updates.slice(j, j + CHUNK_SIZE);
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: chunk
          }
        });
      }
    } else {
      console.log(`    No 'Gala' occurrences found in ${sName}.`);
    }
  }

  console.log('--- Patching Complete ---');
}

patch().catch(console.error);
