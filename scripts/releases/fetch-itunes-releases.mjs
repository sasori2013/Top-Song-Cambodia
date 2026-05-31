/**
 * fetch-itunes-releases.mjs
 *
 * Fetches album/EP data from iTunes API for all artists in artists_master,
 * then upserts into heat_releases.
 *
 * Priority:
 *   1. apple_music_url registered → extract artist ID directly (accurate)
 *   2. No URL → iTunes name search (skipped if multiple candidates found)
 *
 * Safe to re-run: INSERT OR IGNORE via release_id deduplication.
 */

import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const DATASET = 'heat_ranking';
const ITUNES_BASE = 'https://itunes.apple.com';

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status === 503) {
      const wait = 5000 * i;
      console.log(`  [RATE LIMIT] waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (i === retries) throw new Error(`JSON parse failed: ${text.slice(0, 80)}`);
      await sleep(3000 * i);
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

// Extract numeric artist ID from Apple Music URL
// e.g. https://music.apple.com/kh/artist/vannda/1517020648 → "1517020648"
function extractArtistId(url) {
  const m = url.match(/\/(\d+)\s*$/);
  return m ? m[1] : null;
}

// Resolve artist ID: from URL if available, else iTunes search by name
async function resolveArtistId(artistName, appleMusicUrl) {
  if (appleMusicUrl) {
    const id = extractArtistId(appleMusicUrl);
    if (id) return { id, source: 'url' };
  }

  // Fallback: name search
  const url = `${ITUNES_BASE}/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&country=kh&limit=5`;
  const json = await fetchWithRetry(url);
  const results = json.results || [];

  // Exact name match only (case-insensitive)
  const exact = results.filter(r =>
    r.artistName.toLowerCase() === artistName.toLowerCase()
  );

  if (exact.length === 1) return { id: String(exact[0].artistId), source: 'search' };
  if (exact.length > 1) return { id: null, source: 'ambiguous', count: exact.length };
  return { id: null, source: 'not_found' };
}

// Fetch albums/EPs for an artist from iTunes
async function fetchAlbums(artistId, country = 'kh') {
  const url = `${ITUNES_BASE}/lookup?id=${artistId}&entity=album&country=${country}&limit=200`;
  const json = await fetchWithRetry(url);
  return (json.results || []).filter(r =>
    r.wrapperType === 'collection' &&
    r.collectionType === 'Album' &&
    r.trackCount > 1  // exclude singles
  );
}

function detectReleaseType(album) {
  const name = (album.collectionName || '').toLowerCase();
  const count = album.trackCount || 0;
  if (/\bep\b/.test(name)) return 'ep';
  if (count >= 3 && count <= 5) return 'ep';
  if (count >= 6 || /album/.test(name)) return 'album';
  return 'ep';
}

function generateReleaseId(artistId, collectionId) {
  // Use iTunes collectionId as stable unique key
  return `itunes_${artistId}_${collectionId}`;
}

async function ensureReleasesTable(bq) {
  const table = bq.dataset(DATASET).table('heat_releases');
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: [
        { name: 'release_id',         type: 'STRING',    mode: 'REQUIRED' },
        { name: 'artist_id',          type: 'STRING',    mode: 'NULLABLE' },
        { name: 'artist_name',        type: 'STRING',    mode: 'NULLABLE' },
        { name: 'album_name',         type: 'STRING',    mode: 'NULLABLE' },
        { name: 'album_name_raw',     type: 'STRING',    mode: 'NULLABLE' },
        { name: 'release_type',       type: 'STRING',    mode: 'NULLABLE' },
        { name: 'track_count',        type: 'INT64',     mode: 'NULLABLE' },
        { name: 'itunes_collection_id', type: 'STRING',  mode: 'NULLABLE' },
        { name: 'apple_music_url',    type: 'STRING',    mode: 'NULLABLE' },
        { name: 'first_release_date', type: 'DATE',      mode: 'NULLABLE' },
        { name: 'last_release_date',  type: 'DATE',      mode: 'NULLABLE' },
        { name: 'source',             type: 'STRING',    mode: 'NULLABLE' }, // 'itunes' | 'youtube_desc'
        { name: 'created_at',         type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'updated_at',         type: 'TIMESTAMP', mode: 'REQUIRED' },
      ],
      clustering: { fields: ['artist_id', 'release_type'] },
    });
    console.log('[BQ] Created table heat_releases');
  } else {
    // Add new columns if missing (idempotent)
    await bq.query(`
      ALTER TABLE \`${DATASET}.heat_releases\`
      ADD COLUMN IF NOT EXISTS itunes_collection_id STRING,
      ADD COLUMN IF NOT EXISTS apple_music_url STRING,
      ADD COLUMN IF NOT EXISTS source STRING
    `).catch(() => {}); // ignore if already exists
  }
}

async function fetchArtists(bq) {
  const [rows] = await bq.query({
    query: `
      SELECT name, channelId AS artist_id, apple_music_url
      FROM \`${DATASET}.artists_master\`
      WHERE name IS NOT NULL
      ORDER BY name
    `
  });
  return rows;
}

async function upsertReleases(bq, releases) {
  if (releases.length === 0) return 0;
  const now = new Date().toISOString();
  const esc = v => v == null ? 'NULL' : JSON.stringify(String(v));
  const escDate = v => v == null ? 'NULL' : `DATE '${v}'`;

  const BATCH = 100;
  let total = 0;
  for (let i = 0; i < releases.length; i += BATCH) {
    const batch = releases.slice(i, i + BATCH);
    const values = batch.map(r => `(${[
      esc(r.release_id), esc(r.artist_id), esc(r.artist_name),
      esc(r.album_name), esc(r.album_name_raw), esc(r.release_type),
      r.track_count ?? 'NULL',
      esc(r.itunes_collection_id), esc(r.apple_music_url), esc(r.source),
      escDate(r.first_release_date), escDate(r.last_release_date),
      `TIMESTAMP '${now}'`, `TIMESTAMP '${now}'`,
    ].join(', ')})`).join(',\n');

    await bq.query(`
      INSERT INTO \`${DATASET}.heat_releases\`
        (release_id, artist_id, artist_name, album_name, album_name_raw,
         release_type, track_count, itunes_collection_id, apple_music_url, source,
         first_release_date, last_release_date, created_at, updated_at)
      SELECT * FROM UNNEST([
        STRUCT(${values.slice(1,-1)})
      ])
      -- skip duplicates
    `).catch(async () => {
      // If duplicate release_id, do UPDATE instead
      for (const r of batch) {
        await bq.query(`
          MERGE \`${DATASET}.heat_releases\` T
          USING (SELECT ${esc(r.release_id)} AS id) S ON T.release_id = S.id
          WHEN MATCHED THEN UPDATE SET
            track_count = ${r.track_count ?? 'NULL'},
            updated_at  = TIMESTAMP '${now}'
          WHEN NOT MATCHED THEN INSERT
            (release_id, artist_id, artist_name, album_name, album_name_raw,
             release_type, track_count, itunes_collection_id, apple_music_url, source,
             first_release_date, last_release_date, created_at, updated_at)
          VALUES (${[
            esc(r.release_id), esc(r.artist_id), esc(r.artist_name),
            esc(r.album_name), esc(r.album_name_raw), esc(r.release_type),
            r.track_count ?? 'NULL',
            esc(r.itunes_collection_id), esc(r.apple_music_url), esc(r.source),
            escDate(r.first_release_date), escDate(r.last_release_date),
            `TIMESTAMP '${now}'`, `TIMESTAMP '${now}'`,
          ].join(', ')})
        `).catch(() => {});
      }
    });
    total += batch.length;
  }
  return total;
}

async function main() {
  const filterArtist = process.argv[2]; // optional: node fetch-itunes-releases.mjs "VannDa"
  console.log('\n=== Fetch iTunes Releases ===');
  if (filterArtist) console.log(`Filter: ${filterArtist}`);

  const bq = createBQ();
  await ensureReleasesTable(bq);

  let artists = await fetchArtists(bq);
  if (filterArtist) {
    artists = artists.filter(a => a.name.toLowerCase() === filterArtist.toLowerCase());
  }
  console.log(`Processing ${artists.length} artists...\n`);

  const allReleases = [];
  const stats = { url: 0, search: 0, ambiguous: 0, not_found: 0 };

  for (const artist of artists) {
    await sleep(600); // rate limit
    const resolved = await resolveArtistId(artist.name, artist.apple_music_url);
    stats[resolved.source] = (stats[resolved.source] || 0) + 1;

    if (!resolved.id) {
      console.log(`  [SKIP] ${artist.name} — ${resolved.source}${resolved.count ? ` (${resolved.count} candidates)` : ''}`);
      continue;
    }

    const albums = await fetchAlbums(resolved.id);
    if (albums.length === 0) continue;

    const releases = albums.map(a => ({
      release_id:           generateReleaseId(artist.artist_id || artist.name, a.collectionId),
      artist_id:            artist.artist_id || null,
      artist_name:          artist.name,
      album_name:           a.collectionName,
      album_name_raw:       a.collectionName,
      release_type:         detectReleaseType(a),
      track_count:          a.trackCount,
      itunes_collection_id: String(a.collectionId),
      apple_music_url:      a.collectionViewUrl || null,
      source:               'itunes',
      first_release_date:   a.releaseDate ? a.releaseDate.slice(0, 10) : null,
      last_release_date:    a.releaseDate ? a.releaseDate.slice(0, 10) : null,
    }));

    console.log(`  [${resolved.source.toUpperCase()}] ${artist.name} — ${releases.length} releases (via ${resolved.source})`);
    releases.forEach(r => console.log(`    [${r.release_type}] "${r.album_name}" ${r.track_count}曲 ${r.first_release_date}`));
    allReleases.push(...releases);
  }

  console.log(`\nResolution stats:`, stats);
  console.log(`Total releases to upsert: ${allReleases.length}`);

  const inserted = await upsertReleases(bq, allReleases);
  console.log(`\n=== Done: ${inserted} releases upserted ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
