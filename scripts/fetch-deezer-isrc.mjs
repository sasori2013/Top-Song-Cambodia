/**
 * fetch-deezer-isrc.mjs
 *
 * Fetches ISRC codes from Deezer API for songs in heat_songs.
 * No auth required. Matches by artist + cleaned title.
 *
 * Run:
 *   node scripts/fetch-deezer-isrc.mjs "VannDa"          # single artist, dry-run
 *   node scripts/fetch-deezer-isrc.mjs "VannDa" --write  # write to BQ
 *   node scripts/fetch-deezer-isrc.mjs --all --write     # all artists
 */

import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const WRITE = process.argv.includes('--write');
const ALL   = process.argv.includes('--all');
const ARTIST_ARG = process.argv.slice(2).find(a => !a.startsWith('--'));

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Strip common video suffixes from titles before matching
function cleanTitle(title) {
  return (title || '')
    .replace(/\s*[\[(].*?[\])]/g, '')  // remove (Official Audio), [M/V] etc.
    .replace(/\s+(feat\.|ft\.|featuring).*/i, '')  // remove feat.
    .replace(/\s*-\s*(official|lyrics?|audio|video|mv|visualizer|remix).*/i, '')
    .replace(/[^\w\sក-៿]/g, ' ')  // keep alphanumeric + Khmer
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Similarity: ratio of matching words
function similarity(a, b) {
  const wa = new Set(a.split(/\s+/).filter(Boolean));
  const wb = new Set(b.split(/\s+/).filter(Boolean));
  if (wa.size === 0) return 0;
  const common = [...wa].filter(w => wb.has(w)).length;
  return common / Math.max(wa.size, wb.size);
}

async function searchDeezer(artist, title) {
  const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=5`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || [];
}

async function getTrackIsrc(trackId) {
  const res = await fetch(`https://api.deezer.com/track/${trackId}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.isrc || null;
}

async function findIsrc(artist, rawTitle) {
  const cleaned = cleanTitle(rawTitle);

  // Try with cleaned title first, then raw
  for (const title of [cleaned, rawTitle]) {
    const results = await searchDeezer(artist, title);
    if (!results?.length) continue;

    for (const track of results) {
      const deezerTitle = cleanTitle(track.title);
      const deezerArtist = (track.artist?.name || '').toLowerCase();
      const score = similarity(cleaned, deezerTitle);

      // Accept if artist matches and title similarity >= 0.6
      if (
        deezerArtist.includes(artist.toLowerCase()) ||
        artist.toLowerCase().includes(deezerArtist)
      ) {
        if (score >= 0.6) {
          const isrc = await getTrackIsrc(track.id);
          return { isrc, deezerTitle: track.title, score };
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log(`\n=== Deezer ISRC Fetch ${WRITE ? '[WRITE]' : '[DRY RUN]'} ===\n`);

  const bq = createBQ();

  // Fetch songs from BQ
  const artistFilter = ALL ? '' : `AND LOWER(canonical_artist) = LOWER('${ARTIST_ARG}')`;
  const [songs] = await bq.query({ query: `
    SELECT heat_id, canonical_title, canonical_artist, youtube_video_id
    FROM \`heat_ranking.heat_songs\`
    WHERE (isrc IS NULL OR isrc = '')
      ${artistFilter}
    ORDER BY canonical_artist, canonical_title
    LIMIT 20000
  ` });

  console.log(`Processing ${songs.length} songs...\n`);

  const results = [];
  let matched = 0, skipped = 0;

  for (const song of songs) {
    await sleep(120); // ~8 req/sec, well within Deezer's limit

    const found = await findIsrc(song.canonical_artist, song.canonical_title);

    if (found?.isrc) {
      matched++;
      console.log(`  ✓ ${song.canonical_title}`);
      console.log(`    → "${found.deezerTitle}" | ISRC: ${found.isrc} (score: ${found.score.toFixed(2)})`);
      results.push({ heat_id: song.heat_id, isrc: found.isrc });
    } else {
      skipped++;
      console.log(`  ✗ ${song.canonical_title}`);
    }
  }

  console.log(`\n=== Result: ${matched} matched, ${skipped} not found ===`);

  if (!WRITE || results.length === 0) {
    if (!WRITE) console.log('\n[DRY RUN] Add --write to save to BigQuery');
    return;
  }

  // Batch update BQ
  console.log(`\nWriting ${results.length} ISRCs to heat_songs...`);
  const BATCH = 50;
  let updated = 0;

  for (let i = 0; i < results.length; i += BATCH) {
    const chunk = results.slice(i, i + BATCH);
    const cases = chunk.map(r => `WHEN heat_id = '${r.heat_id}' THEN '${r.isrc}'`).join('\n      ');
    const ids   = chunk.map(r => `'${r.heat_id}'`).join(', ');

    await bq.query({ query: `
      UPDATE \`heat_ranking.heat_songs\`
      SET isrc = CASE ${cases} END,
          updated_at = CURRENT_TIMESTAMP()
      WHERE heat_id IN (${ids})
    ` });
    updated += chunk.length;
    console.log(`  Updated ${updated}/${results.length}`);
  }

  console.log(`\n=== Done: ${updated} ISRCs written ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
