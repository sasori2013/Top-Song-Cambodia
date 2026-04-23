import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const DATASET_ID = 'heat_ranking';

async function getRoster() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
    range: 'Label_Roster!A:C'
  });
  const rows = res.data.values || [];
  const map = new Map();
  // Skip header
  rows.slice(1).forEach(r => {
    const [labelName, targetArtist, keywordsStr] = r;
    if (!labelName || !targetArtist) return;
    if (!map.has(labelName)) map.set(labelName, []);
    const keywords = (keywordsStr || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k);
    map.get(labelName).push({ targetArtist, keywords });
  });
  return map;
}

async function reapply() {
  console.log('--- Re-applying Label Roster to BigQuery ---');
  const rosterMap = await getRoster();
  console.log(`Loaded ${rosterMap.size} labels from roster.`);

  // Find all candidate songs from target labels to ensure B-column is singer-primary
  const [songs] = await bq.query(`
    SELECT videoId, title, artist, detectedArtist, featuring
    FROM \`${DATASET_ID}.songs_master\`
    WHERE (
      LOWER(artist) LIKE '%production%' 
      OR LOWER(artist) LIKE '%rasmey%' 
      OR LOWER(artist) LIKE '%town%'
      OR LOWER(artist) LIKE '%sunday%'
      OR LOWER(artist) LIKE '%galaxy%'
      OR LOWER(artist) LIKE '%klap%'
      OR LOWER(artist) LIKE '%cg movement%'
    )
    OR (
      LOWER(detectedArtist) IN ('rhm', 'town', 'sunday', 'galaxy', 'ream', 'cg')
    )
  `);

  console.log(`Found ${songs.length} potentially misaligned songs.`);
  
  const fixes = [];
  for (const song of songs) {
    let fixedArtist = null;

    // Normalize label name for lookup
    let lookupLabel = song.artist;
    const lowerArtist = (song.artist || '').toLowerCase();
    if (lowerArtist === 'rhm' || lowerArtist === 'hang meas') lookupLabel = 'Rasmey Hang Meas';
    if (lowerArtist === 'town') lookupLabel = 'Town Production';
    if (lowerArtist === 'sunday') lookupLabel = 'Sunday Production';
    if (lowerArtist === 'galaxy') lookupLabel = 'Galaxy Navatra';
    if (lowerArtist === 'ream') lookupLabel = 'Ream Production';

    // 1. Try Roster First
    if (rosterMap.has(lookupLabel)) {
      const titleLower = song.title.toLowerCase();
      const descLower = (song.description || '').toLowerCase();
      for (const rule of rosterMap.get(lookupLabel)) {
        if (rule.keywords.some(kw => titleLower.includes(kw) || descLower.includes(kw))) {
          fixedArtist = rule.targetArtist;
          break;
        }
      }
    }

    // 2. Fallback: Promote Featuring to DetectedArtist if only one name exists 
    // and it's from a production channel (High confidence that the only artist found is the primary one)
    if (!fixedArtist && song.featuring && song.featuring.length > 1 && !song.featuring.includes(',')) {
      fixedArtist = song.featuring;
      console.log(`  ⬆️ Promoting Feature: "${song.title.substring(0, 30)}..." -> ${fixedArtist}`);
    }

    if (fixedArtist) {
      fixes.push({ videoId: song.videoId, fixedArtist });
    }
  }

  if (fixes.length === 0) {
    console.log('No roster matches or featured promotions found.');
    return;
  }

  console.log(`Applying ${fixes.length} fixes to BigQuery...`);

  const BATCH = 100;
  for (let i = 0; i < fixes.length; i += BATCH) {
    const chunk = fixes.slice(i, i + BATCH);
    const valuesSql = chunk.map((_, j) => `SELECT @vId${j} as vId, @artist${j} as newArtist`).join('\n      UNION ALL ');
    const params = {};
    chunk.forEach((r, j) => {
      params[`vId${j}`] = r.videoId;
      params[`artist${j}`] = r.fixedArtist;
    });

    const mergeSql = `
      MERGE \`${DATASET_ID}.songs_master\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          artist = S.newArtist, -- Aggressively overwrite artist column
          detectedArtist = S.newArtist,
          classificationSource = 'AI_CLEANED'
    `;
    await bq.query({ query: mergeSql, params });
    console.log(`  Processed ${i + chunk.length} / ${fixes.length}`);
  }

  console.log('--- Roster Re-applied Successfully ---');
}

reapply().catch(console.error);
