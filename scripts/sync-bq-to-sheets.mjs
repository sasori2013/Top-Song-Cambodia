import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_master';

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function sync() {
  console.log('--- Syncing BigQuery to Sheets (Deep Reset) ---');

  // 1. Fetch data from BQ
  const [rows] = await bq.query(`
    SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    ORDER BY publishedAt DESC
  `);
  console.log(`  Fetched ${rows.length} songs from BigQuery.`);

  // 2. Prepare Sheet Data
  const sheetData = rows.map(r => {
    let pubDate = r.publishedAt;
    // BigQuery timestamps come as objects with a 'value' property
    if (pubDate && typeof pubDate === 'object' && pubDate.value) {
      pubDate = pubDate.value;
    }
    // Convert to simple ISO-like string without fractional seconds
    if (pubDate instanceof Date) {
      pubDate = pubDate.toISOString().split('.')[0].replace('T', ' ') + 'Z';
    } else if (typeof pubDate === 'string' && pubDate.includes('.')) {
      pubDate = pubDate.split('.')[0].replace('T', ' ') + 'Z';
    }

    return [
      String(r.videoId || ''),
      String(r.artist || ''),
      String(r.title || ''),
      String(r.cleanTitle || ''),
      String(pubDate || ''),
      String(r.eventTag || ''),
      String(r.category || ''),
      String(r.detectedArtist || ''),
      String(r.featuring || ''),
      `https://www.youtube.com/watch?v=${r.videoId}`
    ];
  });

  const header = ['videoId', 'artist', 'title', 'Clean Title', 'publishedAt', 'Event Tag', 'Category', 'DetectedArtist', 'Featuring', 'Link'];
  
  // Define ranking window: 60 days
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
  console.log(`  Ranking window cutoff: ${sixtyDaysAgo.toISOString().split('T')[0]}`);

  // Filter for SONGS sheet (recent 60 days)
  const topRows = rows.filter(r => {
    let pubDate = r.publishedAt;
    if (pubDate && typeof pubDate === 'object' && pubDate.value) pubDate = pubDate.value;
    const d = new Date(pubDate);
    return d >= sixtyDaysAgo;
  });

  const songsTopData = [header, ...sheetData.slice(0, topRows.length)];
  const songsLongData = [header, ...sheetData];

  console.log(`  SONGS sheet will have ${topRows.length} recent songs.`);
  console.log(`  SONGS_LONG sheet will have ${sheetData.length} total songs.`);

  // 3. Ensure Grid Limits are enough
  console.log('  Ensuring sheet grid limits...');
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const songsSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'SONGS');
  const songsLongSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'SONGS_LONG');

  const requests = [];
  if (songsSheet && songsSheet.properties.gridProperties.rowCount < songsTopData.length + 100) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: songsSheet.properties.sheetId, gridProperties: { rowCount: songsTopData.length + 500 } },
        fields: 'gridProperties.rowCount'
      }
    });
  }
  if (songsLongSheet && songsLongSheet.properties.gridProperties.rowCount < songsLongData.length + 100) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: songsLongSheet.properties.sheetId, gridProperties: { rowCount: songsLongData.length + 500 } },
        fields: 'gridProperties.rowCount'
      }
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
    console.log('    Grid limits expanded.');
  }

  console.log('  Updating SONGS sheet (up to 5000 rows)...');
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'SONGS!A:J' });
  
  // Batch update for SONGS too
  const SONGS_CHUNK = 1000;
  for (let i = 0; i < songsTopData.length; i += SONGS_CHUNK) {
      const chunk = songsTopData.slice(i, i + SONGS_CHUNK);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `SONGS!A${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: chunk }
      });
  }

  console.log(`  Updating SONGS_LONG sheet (${sheetData.length} rows)...`);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A:J' });
  
  const LONG_CHUNK = 1000;
  for (let i = 0; i < songsLongData.length; i += LONG_CHUNK) {
    const chunk = songsLongData.slice(i, i + LONG_CHUNK);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `SONGS_LONG!A${i + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: chunk }
    });
    if (i % 5000 === 0) console.log(`    Sent row ${i}...`);
  }

  console.log('--- Sheets Synchronized Successfully ---');
}

sync().catch(console.error);
