/**
 * test-releases.mjs
 * Dry-run release detection for specific artists only. No BQ writes.
 */

import dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  extractAlbumInfo,
  normalizeAlbumName,
  generateReleaseId,
  detectReleaseType,
} from './release-detector.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const DATASET = 'heat_ranking';
const TEST_ARTISTS = ['vannda', 'g-devith'];

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

async function main() {
  console.log(`\n=== Release Detection Test: ${TEST_ARTISTS.join(', ')} ===\n`);
  const bq = createBQ();

  const filter = TEST_ARTISTS.map(n => `'${n}'`).join(', ');
  const query = `
    SELECT
      s.videoId,
      s.artist,
      s.title,
      s.description,
      DATE(s.publishedAt, 'Asia/Phnom_Penh') AS release_date,
      a.channelId AS artist_id
    FROM \`${DATASET}.songs_master\` s
    LEFT JOIN \`${DATASET}.artists_master\` a
      ON LOWER(TRIM(a.name)) = LOWER(TRIM(s.artist))
    WHERE s.description IS NOT NULL AND TRIM(s.description) != ''
      AND LOWER(TRIM(s.artist)) IN (${filter})
    ORDER BY s.artist, s.publishedAt
  `;

  const [songs] = await bq.query({ query });
  console.log(`Fetched ${songs.length} songs with descriptions\n`);

  // Group into releases
  const releases = new Map();
  const noAlbum = [];

  for (const song of songs) {
    const { albumName, trackNumber } = extractAlbumInfo(song.description);
    if (!albumName) {
      noAlbum.push({ artist: song.artist, title: song.title });
      continue;
    }
    const normalized = normalizeAlbumName(albumName);
    const artistId = song.artist_id || `name:${song.artist}`;
    const key = `${artistId}__${normalized}`;

    if (!releases.has(key)) {
      releases.set(key, {
        release_id: generateReleaseId(artistId, normalized),
        artist_name: song.artist,
        album_name: albumName,
        songs: [],
      });
    }
    releases.get(key).songs.push({ title: song.title, release_date: song.release_date, trackNumber });
  }

  // Print results
  console.log(`=== Detected Releases (${releases.size}) ===`);
  for (const rel of releases.values()) {
    const dates = rel.songs.map(s => s.release_date?.value || s.release_date).filter(Boolean).sort();
    const type = detectReleaseType(rel.songs.length, rel.album_name);
    console.log(`\n[${type.toUpperCase()}] ${rel.artist_name} — "${rel.album_name}"`);
    console.log(`  tracks: ${rel.songs.length}  |  first: ${dates[0] || '?'}  |  last: ${dates[dates.length-1] || '?'}`);
    rel.songs
      .sort((a, b) => (a.trackNumber || 99) - (b.trackNumber || 99))
      .forEach(s => console.log(`    #${s.trackNumber ?? '?'}  ${s.title}`));
  }

  if (noAlbum.length > 0) {
    console.log(`\n=== Songs with NO album info (${noAlbum.length}) ===`);
    noAlbum.forEach(s => console.log(`  ${s.artist} — ${s.title}`));
  }

  console.log('\n=== Done (dry-run, no BQ writes) ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
