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

const IGNORED_TERMS = [
  'mv', 'official', 'lyric', 'video', 'audio', '4k', 'cover', 'teaser', 'trailer', 'full', 'live',
  'original', 'version', 'ver', 'music', 'Visualizer', 'Visual', 'HD'
];

function isCleanString(str) {
  if (str.length < 2 || str.length > 50) return false;
  // Ignore parts that are entirely numbers
  if (/^\d+$/.test(str)) return false;
  // Ignore generic production words
  const lower = str.toLowerCase();
  for (const term of IGNORED_TERMS) {
    if (lower === term || lower === `[${term}]` || lower === `(${term})`) return false;
    // Check if it's mostly noise
    if (lower.split(' ').every(w => IGNORED_TERMS.includes(w.replace(/[^a-z]/g, '')))) return false;
  }
  return true;
}

async function extract() {
  console.log('--- Starting Automated Artist Extraction ---');

  // 1. Get Production Channels
  const [artistsSheet] = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A:F' }).then(res => [res.data.values || []]);
  const productions = artistsSheet.filter(r => r[5] === 'P').map(r => r[0]);
  console.log(`Found ${productions.length} Productions: ${productions.join(', ')}`);

  // 2. Fetch Songs from BQ
  const [songs] = await bq.query('SELECT artist, title FROM `heat_ranking.songs_master`');
  const prodSongs = songs.filter(s => productions.includes(s.artist));
  console.log(`Found ${prodSongs.length} songs belonging to Productions.`);

  // 3. Frequency Analysis
  const extractionByProd = new Map();

  for (const song of prodSongs) {
    const prod = song.artist;
    if (!extractionByProd.has(prod)) extractionByProd.set(prod, new Map());
    const freqMap = extractionByProd.get(prod);

    // Clean title basics
    let t = song.title.replace(/[\[\]\(\)“”""]/g, ' | '); 
    t = t.replace(/ ft\. | feat\. | ft | feat | x | & | vs /gi, ' | '); // Treat featuring as splitters

    const parts = t.split(/[-|]/);
    
    parts.forEach(p => {
      let cleanPart = p.trim();
      // Remove trailing common words
      cleanPart = cleanPart.replace(/offical|official|mv|music video|lyric|lyrics|audio/gi, '').trim();
      // Remove trailing non-alphanumeric (except khmer script if possible, just general cleanup)
      cleanPart = cleanPart.replace(/^[^a-zA-Z0-9\u1780-\u17FF]+|[^a-zA-Z0-9\u1780-\u17FF]+$/g, '').trim();

      if (isCleanString(cleanPart)) {
        // Also avoid capturing the production name itself
        if (cleanPart.toLowerCase() !== prod.toLowerCase() && !prod.toLowerCase().includes(cleanPart.toLowerCase())) {
          freqMap.set(cleanPart, (freqMap.get(cleanPart) || 0) + 1);
        }
      }
    });
  }

  // 4. Sort and Prepare Rows format
  const rowsToWrite = [];
  rowsToWrite.push(['プロダクション名 (Label)', '正式アーティスト名 (Target Artist)', '検索キーワード (Keywords) / Frequency']);

  for (const [prod, freqMap] of extractionByProd.entries()) {
    // Sort by frequency, keep top ones
    const sorted = [...freqMap.entries()].filter(x => x[1] >= 3).sort((a, b) => b[1] - a[1]);
    
    // Take top 30 as candidates
    sorted.slice(0, 30).forEach(([name, count]) => {
      // Put the name in both target and keywords, append count as note for user
      rowsToWrite.push([prod, name, name, `Score: ${count}`]);
    });
  }

  // 5. Write to Label_Roster Sheet
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  let rosterSheetId = null;
  const existingSheet = spreadsheet.data.sheets.find(s => s.properties.title === 'Label_Roster');
  
  if (!existingSheet) {
    console.log('Creating Label_Roster sheet...');
    const createRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: 'Label_Roster' } }
        }]
      }
    });
    rosterSheetId = createRes.data.replies[0].addSheet.properties.sheetId;
  } else {
    console.log('Label_Roster sheet already exists. Clearing...');
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A:D' });
    rosterSheetId = existingSheet.properties.sheetId;
  }

  console.log(`Writing ${rowsToWrite.length - 1} extracted candidates to Sheet...`);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'Label_Roster!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rowsToWrite }
  });

  // Freeze top row & Auto resize
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        { updateSheetProperties: { properties: { sheetId: rosterSheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { autoResizeDimensions: { dimensions: { sheetId: rosterSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 4 } } }
      ]
    }
  });

  console.log('--- Extraction Complete! ---');
}

extract().catch(console.error);
