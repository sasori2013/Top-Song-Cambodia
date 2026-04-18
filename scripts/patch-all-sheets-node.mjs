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
  console.log('--- Total Sheet Metadata Synchronization ---');

  // 1. Fetch Master Data from BQ
  console.log('  Fetching master data from BigQuery...');
  const [songs] = await bq.query('SELECT videoId, title, artist FROM `heat_ranking.songs_master`');
  
  const titleMap = new Map(); // title -> artist
  const idMap = new Map();    // videoId -> artist
  const validIds = new Set();
  
  songs.forEach(s => {
    idMap.set(s.videoId, s.artist);
    validIds.add(s.videoId);
    // Be careful with duplicate titles, but for specific productions they are unique enough
    if (s.artist !== 'Gala') {
      titleMap.set(s.title, s.artist);
    }
  });

  // 2. Identify Non-Music Ids to purge (Vin Vitou cleanup)
  // Actually, I just cleaned them from BQ, so anything that was in BQ before but is NOT now 
  // might be a candidate for deletion. 
  // However, I'll just use the IDs I deleted earlier if I had them. 
  // Let's assume anything currently in BigQuery is the only thing that should exist in reports.

  const sheetsToPatch = [
    { name: 'RANKING_DAILY', artCol: 'アーティスト', titleCol: '曲名' },
    { name: 'RANKING_WEEKLY', artCol: 'アーティスト', titleCol: '曲名' },
    { name: 'RANKING_LONG', artCol: 'アーティスト', titleCol: '曲名' },
    { name: 'RANKING_AI_TEST', artCol: 'アーティスト', titleCol: '曲名' },
    { name: 'RANK_HISTORY', pkCol: 'videoId' } // RANK_HISTORY doesn't have artist/title usually
  ];

  const spreadsheetData = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });

  for (const sCfg of sheetsToPatch) {
    const sName = sCfg.name;
    console.log(`  Processing ${sName}...`);
    
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sName}!A:J` });
    const rows = res.data.values;
    if (!rows || rows.length === 0) continue;

    const header = rows[0];
    const artIdx = sCfg.artCol ? header.indexOf(sCfg.artCol) : -1;
    const titleIdx = sCfg.titleCol ? header.indexOf(sCfg.titleCol) : -1;
    const pkIdx = sCfg.pkCol ? header.indexOf(sCfg.pkCol) : -1;

    const updates = [];
    const rowsToDelete = [];
    
    // For RANKING sheets, artist/title/videoId might all be there
    // For RANK_HISTORY, only videoId is there
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const videoId = pkIdx !== -1 ? row[pkIdx] : null;
      const title = titleIdx !== -1 ? row[titleIdx] : null;
      const artist = artIdx !== -1 ? row[artIdx] : null;

      // a. Check for Deletion (If videoId is missing from BQ master)
      if (videoId && !validIds.has(videoId)) {
          // If it was previously there, we should delete the reporting row too
          // (Especially if it's the deleted Vietnamese song or Vin Vitou non-music)
          rowsToDelete.push(i);
          continue;
      }

      // b. Check for Name Fix (Gala or other)
      let correctArtist = null;
      if (videoId && idMap.has(videoId)) {
          correctArtist = idMap.get(videoId);
      } else if (title && titleMap.has(title)) {
          correctArtist = titleMap.get(title);
      }

      if (correctArtist && artist && artist !== correctArtist) {
          // Special check for 'Gala' or known ruins
          if (artist === 'Gala' || artist.toLowerCase().includes('gala') || artist === 'Vin Vitou') {
              updates.push({
                range: `${sName}!${String.fromCharCode(65 + artIdx)}${i + 1}`,
                values: [[correctArtist]]
              });
          }
      }
    }

    // Apply Updates
    if (updates.length > 0) {
      console.log(`    Applying ${updates.length} name fixes to ${sName}...`);
      const CHUNK_SIZE = 500;
      for (let j = 0; j < updates.length; j += CHUNK_SIZE) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates.slice(j, j + CHUNK_SIZE) }
        });
      }
    }

    // Apply Deletions
    if (rowsToDelete.length > 0) {
      console.log(`    Deleting ${rowsToDelete.length} noisy rows from ${sName}...`);
      const sheetId = spreadsheetData.data.sheets.find(s => s.properties.title === sName).properties.sheetId;
      const deleteRequests = rowsToDelete.sort((a, b) => b - a).map(idx => ({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }
        }
      }));

      const CHUNK_SIZE = 100;
      for (let j = 0; j < deleteRequests.length; j += CHUNK_SIZE) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: deleteRequests.slice(j, j + CHUNK_SIZE) }
        });
      }
    }
  }

  console.log('--- Total Synchronization Complete ---');
}

patch().catch(console.error);
