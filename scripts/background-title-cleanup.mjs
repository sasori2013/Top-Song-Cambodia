import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const BATCH_SIZE = 500;

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]/g, '').replace(/['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

function cleanSongTitle(rawTitle, artistName) {
  if (!rawTitle) return '';
  let title = rawTitle;

  // 1. Remove metadata blocks in brackets/parentheses
  const metadataRegex = /\s*[([][^()[\]]*(?:Official|Music Video|MV|Audio|Lyric|Visualizer|Visual|Cover|Live|Performance|Teaser|Trailer|Prod\.|Prod by|Directed by)[^()[\]]*[)\]]/gi;
  title = title.replace(metadataRegex, '');

  // 2. Remove known production labels appended at the end
  const labelsRegex = /\s*(?:\||-)\s*(?:Town Production|RHM|Galaxy Navatra|Sunday Production|Galaxy[\s\-]+Navatra|KlapYaHandz|Baramey|Pleng)\b/gi;
  title = title.replace(labelsRegex, '');

  // 3. Remove emoji/music notes
  title = title.replace(/[🎵🎶🎼🎧🎤]/g, '');

  // 4. Remove redundant artist name at the beginning  e.g. "VannDa - Time To Rise" -> "Time To Rise"
  if (artistName && artistName.length > 2) {
    const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const artistPrefixRegex = new RegExp('^\\s*(?:' + escapedArtist + ')\\s*(?:-|\\|)\\s+', 'i');
    title = title.replace(artistPrefixRegex, '');
  }

  // 5. Cleanup extra spaces or lingering dashes
  title = title.trim();
  title = title.replace(/^[-|~_]+\s*/, '');
  title = title.replace(/\s+[-|~_]+\s*$/, '');
  title = title.replace(/\s{2,}/g, ' ');

  if (title.length === 0) {
    return rawTitle.replace(metadataRegex, '').trim();
  }

  return title;
}

async function runTitleCleanup() {
  console.log('--- Background Title Cleanup Started ---');

  const selectSql = 'SELECT videoId, title, artist, cleanTitle FROM `' + DATASET_ID + '.songs_master` WHERE cleanTitle IS NULL OR cleanTitle = \'\' LIMIT ' + BATCH_SIZE;
  const [songs] = await bq.query(selectSql);

  if (songs.length === 0) {
    console.log('No songs require title cleanup at this time.');
    return;
  }

  console.log('Found ' + songs.length + ' songs to clean.');

  const updates = [];
  let changedCount = 0;

  for (const song of songs) {
    const cleaned = cleanSongTitle(song.title, song.artist);
    updates.push({ videoId: song.videoId, cleanTitle: cleaned || song.title });
    if (cleaned !== song.title) {
      changedCount++;
      if (changedCount <= 10) {
        console.log('  [' + song.artist + '] "' + song.title + '" -> "' + cleaned + '"');
      }
    }
  }

  if (updates.length > 0) {
    console.log('Updating ' + updates.length + ' records in BigQuery...');
    const valuesSql = updates.map((_, j) => 'SELECT @vId' + j + ' as vId, @cTitle' + j + ' as cTitle').join('\n      UNION ALL ');
    const params = {};
    updates.forEach((r, j) => {
      params['vId' + j] = r.videoId;
      params['cTitle' + j] = r.cleanTitle;
    });
    const mergeSql = 'MERGE `' + DATASET_ID + '.songs_master` T USING (' + valuesSql + ') S ON T.videoId = S.vId WHEN MATCHED THEN UPDATE SET cleanTitle = S.cTitle';
    try {
      await bq.query({ query: mergeSql, params });
      console.log('Successfully updated ' + updates.length + ' clean titles (' + changedCount + ' actually changed).');
    } catch (e) {
      console.error('Update failed: ' + e.message);
    }
  }

  console.log('--- Background Title Cleanup Completed ---');
}

runTitleCleanup().catch((error) => {
  console.error('Fatal Error:', error);
  process.exit(1);
});
