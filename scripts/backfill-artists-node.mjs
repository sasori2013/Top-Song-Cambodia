import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function robustSync() {
  console.log('--- Starting Robust Propagation Sync: Aggressive Cleanup Mode ---');

  // 1. Get the "Corrected" Artists list from the user
  console.log('Fetching user-corrected Artist list...');
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:A' });
  const officialNames = (resArtists.data.values || []).map(r => String(r[0]).trim()).filter(Boolean);
  
  // Strip invisible characters from official names too for matching
  const stripSpecial = (n) => n.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  const officialMap = new Map(); // normalizedKey -> officialName
  officialNames.forEach(name => {
    const clean = stripSpecial(name);
    const key = clean.toLowerCase().replace(/\s+/g, '');
    officialMap.set(key, name); // Map back to actual string in Sheet
  });

  console.log(`Loaded ${officialNames.length} official artists.`);

  // Load aliases
  let aliasMap = new Map();
  try {
    const resAliases = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artist_Aliases!A2:B' });
    (resAliases.data.values || []).forEach(r => {
      const official = (r[0] || '').trim();
      const alias = (r[1] || '').trim();
      if (official && alias) {
        aliasMap.set(stripSpecial(alias).toLowerCase().replace(/\s+/g, ''), official);
      }
    });
  } catch (e) { /* ignore */ }

  const normalizeToTruth = (name) => {
    if (!name) return '';
    let cleanName = stripSpecial(name);
    
    // Aggressive Global Noise Removal
    const noisePatterns = [
      /official\s*music\s*video/gi,
      /official\s*audio/gi,
      /official\s*video/gi,
      /official\s*mv/gi,
      /official\s*lyrics/gi,
      /official\s*visualizer/gi,
      /official\s*channel/gi,
      /official\s*playlist/gi,
      /official/gi,
      /\[\s*.*?\s*\]/g, // Remove anything in brackets [ ]
      /\(\s*.*?\s*\)/g, // Remove anything in parenthesis ( )
      /【\s*.*?\s*】/g, // Japanese style brackets
      /music/gi,
      /video/gi,
      /audio/gi,
      /mv/gi
    ];
    
    noisePatterns.forEach(p => {
      cleanName = cleanName.replace(p, '');
    });
    
    // Remove any remaining leading/trailing punctuation or noise
    cleanName = cleanName.replace(/^[\s\-_|/]+|[\s\-_|/]+$/g, '').trim();
    
    // Final check for lone dashes or noise
    if (/^[\s\-_|/]+$/.test(cleanName)) return '';

    const key = cleanName.toLowerCase().replace(/\s+/g, '');
    
    // 1. Direct match in official truth
    if (officialMap.has(key)) return officialMap.get(key);
    
    // 2. Check aliases
    if (aliasMap.has(key)) {
      const aOfficial = aliasMap.get(key);
      const aKey = stripSpecial(aOfficial).toLowerCase().replace(/\s+/g, '');
      return officialMap.get(aKey) || aOfficial;
    }
    
    // 3. Fallback: return cleaned name (Strictly no substring matching to avoid unnatural changes)
    return cleanName;
  };

  const processCollaborations = (rawName, titleFallback = '') => {
    // Aggressive delimiters including 다양한 dash variants and pipe/slash/underscore
    const delimiters = /\s*(?:x|&|,|ft\.?|feat\.?|\||\/|_| - | – | — )\s*/i;
    let parts = [];
    
    if (rawName && rawName.trim()) {
      parts = rawName.split(delimiters).map(p => p.trim()).filter(Boolean);
    }
    
    // Recovery Logic: If the rawName doesn't match much or looks like a ruined normalization (e.g. 'Gala'),
    // try parsing from the video title.
    if (parts.length === 0 || (parts.length === 1 && parts[0].length <= 4) || titleFallback.toLowerCase().includes(parts[0]?.toLowerCase())) {
      const dashVariants = [' - ', ' – ', ' — ', ' - '];
      let artistPartFromTitle = '';
      for (const d of dashVariants) {
        if (titleFallback.includes(d)) {
          artistPartFromTitle = titleFallback.split(d)[0].trim();
          break;
        }
      }
      
      if (artistPartFromTitle) {
        const titleParts = artistPartFromTitle.split(delimiters).map(p => p.trim()).filter(Boolean);
        // If title parts look more "complete" (longer) than original parts, prioritize them
        if (titleParts.length > 0) {
          // If the original part was ruins (like 'Gala' which is a substring of Galaxy), 
          // prefer the longer title part.
          if (parts.length === 0 || artistPartFromTitle.length > parts[0].length) {
            parts = titleParts;
          }
        }
      }
    }
    
    const normalized = parts.map(p => normalizeToTruth(p)).filter(p => !/^[ \-_|/]+$/.test(p) && p.length > 0);
    return {
      main: normalized[0] || '',
      featuring: normalized.slice(1).join(', ')
    };
  };

  // 2. Process ALL song sheets
  const sheetsToProcess = [
    { name: 'SONGS', range: 'SONGS!A2:H' },
    { name: 'SONGS_LONG', range: 'SONGS_LONG!A2:I' }
  ];

  const updatePayloads = [];

  for (const sDef of sheetsToProcess) {
    console.log(`Analyzing Sheet: ${sDef.name}...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: sDef.range });
    const rows = res.data.values || [];
    
    rows.forEach((row, i) => {
      const curArtistColB = row[1] || '';
      const title = row[2] || '';
      const curDetectedColG = row[6] || '';
      const curFeaturingColH = row[7] || '';
      
      const parsedArtist = processCollaborations(curArtistColB);
      // NUCLEAR: If detected contains noise like "OFFICIAL", re-parse everything from title or Col B
      const needsReparse = curDetectedColG.toLowerCase().includes('official') || 
                           curDetectedColG.toLowerCase().includes('audio') ||
                           !curDetectedColG;

      const parsedDetected = processCollaborations(needsReparse ? (curArtistColB || title) : curDetectedColG, title);

      let finalMain = parsedDetected.main || parsedArtist.main;
      let finalFeat = parsedDetected.featuring;
      
      // Safety: If after all cleanup it's still generic, keep original but normalized
      if (!finalMain) finalMain = normalizeToTruth(curArtistColB);

      let changed = false;
      if (parsedArtist.main !== curArtistColB) changed = true;
      if (finalMain !== curDetectedColG) changed = true;
      if (finalFeat !== curFeaturingColH) changed = true;

      if (changed) {
        updatePayloads.push({ range: `${sDef.name}!B${i + 2}`, values: [[parsedArtist.main]] });
        updatePayloads.push({ range: `${sDef.name}!G${i + 2}`, values: [[finalMain]] });
        updatePayloads.push({ range: `${sDef.name}!H${i + 2}`, values: [[finalFeat]] });
      }
    });
  }

  // 3. Execution on Sheets
  console.log(`Force-updating ${updatePayloads.length} cells in Sheets...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < updatePayloads.length; i += CHUNK_SIZE) {
    const chunk = updatePayloads.slice(i, i + CHUNK_SIZE);
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: chunk }
      });
      console.log(`  Sent batch ${Math.floor(i / CHUNK_SIZE) + 1} / ${Math.ceil(updatePayloads.length / CHUNK_SIZE)}...`);
      await sleep(1000);
    } catch (e) {
      if (e.code === 429) {
        console.warn('  ⚠️ Rate limit. Waiting 45s...');
        await sleep(45000);
        i -= CHUNK_SIZE;
      } else {
        throw e;
      }
    }
  }

  // 4. Synchronization to BigQuery
  console.log('Final Nuclear Sync to BigQuery...');
  const [bqRows] = await bq.query(`SELECT videoId, artist, title, detectedArtist, featuring FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_SONGS}\``);
  
  const bqRawUpdates = bqRows.map(row => {
    const parsedArtist = processCollaborations(row.artist);
    const needsReparse = (row.detectedArtist || '').toLowerCase().includes('official') || !(row.detectedArtist || '').trim();
    const parsedDetected = processCollaborations(needsReparse ? (row.artist || row.title) : row.detectedArtist, row.title);
    
    let finalMain = parsedDetected.main || parsedArtist.main || row.artist;
    let finalFeat = parsedDetected.featuring;

    if (parsedArtist.main !== row.artist || finalMain !== row.detectedArtist || finalFeat !== row.featuring) {
      return { videoId: row.videoId, artist: parsedArtist.main, detectedArtist: finalMain, featuring: finalFeat };
    }
    return null;
  }).filter(Boolean);

  if (bqRawUpdates.length > 0) {
    const unique = [];
    const seen = new Set();
    for (const u of bqRawUpdates) {
      if (!seen.has(u.videoId)) {
        unique.push(u);
        seen.add(u.videoId);
      }
    }

    console.log(`Updating ${unique.length} BQ rows...`);
    const tempFile = join(os.tmpdir(), `nuclear_sync_${Date.now()}.json`);
    fs.writeFileSync(tempFile, unique.map(r => JSON.stringify(r)).join('\n'));

    const tempTableId = `nuclear_temp_${Date.now()}`;
    await bq.dataset(DATASET_ID).table(tempTableId).load(tempFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: [
        {name: 'videoId', type: 'STRING'},
        {name: 'artist', type: 'STRING'},
        {name: 'detectedArtist', type: 'STRING'},
        {name: 'featuring', type: 'STRING'}
      ]}
    });

    await bq.query(`
      MERGE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_SONGS}\` T
      USING \`${PROJECT_ID}.${DATASET_ID}.${tempTableId}\` S
      ON T.videoId = S.videoId
      WHEN MATCHED THEN
        UPDATE SET T.artist = S.artist, T.detectedArtist = S.detectedArtist, T.featuring = S.featuring
    `);
    await bq.dataset(DATASET_ID).table(tempTableId).delete();
    fs.unlinkSync(tempFile);
  }

  console.log('--- Nuclear Propagation Sync Completed Succesfully ---');
}

robustSync().catch(console.error);
