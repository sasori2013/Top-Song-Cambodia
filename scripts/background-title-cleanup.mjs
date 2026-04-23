import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const BATCH_SIZE = 4000;

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]/g, '').replace(/['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

function cleanSongTitle(rawTitle, artistName) {
  if (!rawTitle) return '';
  let title = rawTitle;

  // 1. Remove metadata blocks in brackets/parentheses
  const bracketsRegex = /\s*[([][^()[\]]*(?:Official|Music Video|MV|Audio|Lyric|Visualizer|Visual|Cover|Live|Performance|Teaser|Trailer|Prod\.|Prod by|Directed by|Full Album|Playlist|Special)[^()[\]]*[)\]]/gi;
  title = title.replace(bracketsRegex, '');

  // 2. Remove loose metadata blocks (often at the end after | or -)
  const tagList = 'Official|Music Video|MV|Audio|Lyric|Visualizer|Visual|Cover|Live|Performance|Teaser|Trailer|Full Album|Playlist|Special|Video|Lyrics|Audio Lyric|Classic|Album|MP3';
  const looseTagsRegex = new RegExp('\\s*(?:\\||-|_|~|:)\\s*[^\\||\\-_~:]*(?:' + tagList + ')[^\\||\\-_~:]*$', 'gi');
  title = title.replace(looseTagsRegex, '');

  // 3. Remove known production labels explicitly
  const labels = 'Town Production|RHM|Galaxy Navatra|Sunday Production|Galaxy[\\s\\-]+Navatra|KlapYaHandz|Baramey|Pleng|Ream Production|Rasmey Hang Meas|Diamond Music';
  const labelsRegex = new RegExp('\\s*(?:\\||-|_|~|:)\\s*(?:' + labels + ')\\b', 'gi');
  title = title.replace(labelsRegex, '');

  // 4. Remove Emojis and misc symbols
  title = title.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}🎵🎶🎼🎧🎤✨🔥🌟]/gu, '');

  // 5. Remove redundant artist name at the beginning or end
  if (artistName && artistName.length > 2) {
    const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Start prefix: "Artist - Song"
    const prefixRegex = new RegExp('^\\s*(?:' + escapedArtist + ')\\s*(?:-|\\||:|_|~)\\s+', 'i');
    title = title.replace(prefixRegex, '');
    // End suffix: "Song - Artist"
    const suffixRegex = new RegExp('\\s+(?:-|\\||:|_|~)\\s*(?:' + escapedArtist + ')\\s*$', 'i');
    title = title.replace(suffixRegex, '');
  }
  
  // 6. Remove hashtags
  title = title.replace(/#\w+/g, '');

  // 7. FINAL SCRUB of delimiters
  title = title.trim();
  // Recursive trim of common delimiters and whitespace
  for (let k = 0; k < 3; k++) {
    title = title.replace(/^[-|~_&:.\s]+/, '');
    title = title.replace(/[-|~_&:.\s]+$/, '');
    title = title.trim();
  }
  
  // Collapse double spaces
  title = title.replace(/\s{2,}/g, ' ');

  if (title.length === 0) return rawTitle;
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
