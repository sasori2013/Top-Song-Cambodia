/**
 * build-releases.mjs
 *
 * Scans songs_master.description to extract album/EP metadata,
 * populates heat_releases, and updates heat_songs (album, release_id, track_number).
 *
 * Safe to re-run: uses MERGE for heat_releases, UPDATE for heat_songs.
 */

import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
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

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
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
        { name: 'release_type',       type: 'STRING',    mode: 'NULLABLE' }, // album / ep / single
        { name: 'track_count',        type: 'INT64',     mode: 'NULLABLE' },
        { name: 'first_release_date', type: 'DATE',      mode: 'NULLABLE' },
        { name: 'last_release_date',  type: 'DATE',      mode: 'NULLABLE' },
        { name: 'created_at',         type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'updated_at',         type: 'TIMESTAMP', mode: 'REQUIRED' },
      ],
      clustering: { fields: ['artist_id', 'release_type'] },
    });
    console.log('[BQ] Created table heat_releases');
  }
}

async function ensureHeatSongsColumns(bq) {
  await bq.query({
    query: `
      ALTER TABLE \`${DATASET}.heat_songs\`
        ADD COLUMN IF NOT EXISTS release_id   STRING,
        ADD COLUMN IF NOT EXISTS track_number INT64
    `,
  });
  console.log('[BQ] heat_songs columns ensured (release_id, track_number)');
}

async function fetchSongsWithDescriptions(bq) {
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
    ORDER BY s.artist, s.publishedAt
  `;
  const [rows] = await bq.query({ query });
  console.log(`[Build] Fetched ${rows.length} songs with descriptions`);
  return rows;
}

function groupIntoReleases(songs) {
  // Map: key = artistId + '__' + normalizedAlbumName → { meta, songs[] }
  const releases = new Map();

  for (const song of songs) {
    const { albumName, trackNumber } = extractAlbumInfo(song.description);
    if (!albumName) continue;

    const normalized = normalizeAlbumName(albumName);
    const artistId = song.artist_id || `name:${song.artist}`;
    const key = `${artistId}__${normalized}`;

    if (!releases.has(key)) {
      releases.set(key, {
        release_id: generateReleaseId(artistId, normalized),
        artist_id: song.artist_id || null,
        artist_name: song.artist,
        album_name: albumName,
        album_name_raw: albumName,
        songs: [],
      });
    }

    releases.get(key).songs.push({
      videoId: song.videoId,
      release_date: song.release_date,
      trackNumber,
    });
  }

  return releases;
}

async function upsertReleases(bq, releases) {
  const now = new Date().toISOString();
  const rows = [];
  // Skip single-song "releases" — those are singles, not albums/EPs

  for (const rel of releases.values()) {
    if (rel.songs.length < 3) continue; // skip singles
    const dates = rel.songs.map(s => s.release_date?.value || s.release_date).filter(Boolean).sort();
    const trackCount = rel.songs.length;
    rows.push({
      insertId: rel.release_id,
      json: {
        release_id:         rel.release_id,
        artist_id:          rel.artist_id,
        artist_name:        rel.artist_name,
        album_name:         rel.album_name,
        album_name_raw:     rel.album_name_raw,
        release_type:       detectReleaseType(trackCount, rel.album_name),
        track_count:        trackCount,
        first_release_date: dates[0] || null,
        last_release_date:  dates[dates.length - 1] || null,
        created_at:         now,
        updated_at:         now,
      },
    });
  }

  if (rows.length === 0) return 0;

  // Use DML INSERT to avoid streaming buffer timing issues
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map(r => {
      const j = r.json;
      const esc = v => v == null ? 'NULL' : JSON.stringify(String(v));
      const escDate = v => v == null ? 'NULL' : `DATE '${v}'`;
      return `(${[
        esc(j.release_id), esc(j.artist_id), esc(j.artist_name),
        esc(j.album_name), esc(j.album_name_raw), esc(j.release_type),
        j.track_count ?? 'NULL',
        escDate(j.first_release_date), escDate(j.last_release_date),
        `TIMESTAMP '${j.created_at}'`, `TIMESTAMP '${j.updated_at}'`,
      ].join(', ')})`;
    }).join(',\n');

    await bq.query({
      query: `
        INSERT INTO \`${DATASET}.heat_releases\`
          (release_id, artist_id, artist_name, album_name, album_name_raw,
           release_type, track_count, first_release_date, last_release_date,
           created_at, updated_at)
        VALUES ${values}
      `,
    });
    inserted += batch.length;
  }
  console.log(`[BQ] Inserted ${inserted} releases into heat_releases`);
  return inserted;
}

async function updateHeatSongs(bq) {
  // Join songs_master → artists_master → heat_releases → update heat_songs
  // Uses extractAlbumInfo logic replicated in SQL via description parsing in JS,
  // but since heat_releases is already populated, we can join directly.
  const query = `
    UPDATE \`${DATASET}.heat_songs\` h
    SET
      h.release_id   = src.release_id,
      h.album        = src.album_name,
      h.updated_at   = CURRENT_TIMESTAMP()
    FROM (
      SELECT videoId, release_id, album_name
      FROM (
        SELECT
          s.videoId,
          r.release_id,
          r.album_name,
          -- Prefer release with most tracks when multiple matches exist
          ROW_NUMBER() OVER (PARTITION BY s.videoId ORDER BY r.track_count DESC) AS rn
        FROM \`${DATASET}.songs_master\` s
        JOIN \`${DATASET}.artists_master\` a
          ON LOWER(TRIM(a.name)) = LOWER(TRIM(s.artist))
        JOIN \`${DATASET}.heat_releases\` r
          ON r.artist_id = a.channelId
        WHERE s.description IS NOT NULL
          AND REGEXP_CONTAINS(
            LOWER(REPLACE(REPLACE(s.description, ' ', ''), '_', '')),
            LOWER(REGEXP_REPLACE(r.album_name, r'[^a-zA-Z0-9]', ''))
          )
      )
      WHERE rn = 1
    ) AS src
    WHERE h.youtube_video_id = src.videoId
  `;

  const [job] = await bq.createQueryJob({ query });
  await job.promise();
  const [meta] = await job.getMetadata();
  const updated = Number(meta.statistics?.query?.numDmlAffectedRows || 0);
  console.log(`[BQ] Updated ${updated} rows in heat_songs`);
  return updated;
}

async function main() {
  console.log('\n=== Build Releases ===\n');
  const bq = createBQ();

  await ensureReleasesTable(bq);
  await ensureHeatSongsColumns(bq);

  const songs = await fetchSongsWithDescriptions(bq);
  const releases = groupIntoReleases(songs);
  console.log(`[Build] Detected ${releases.size} releases`);

  // Preview top releases
  let preview = 0;
  for (const [, rel] of releases) {
    if (preview++ >= 10) break;
    console.log(`  ${rel.artist_name} — "${rel.album_name}" (${rel.songs.length} songs)`);
  }

  const releaseCount = await upsertReleases(bq, releases);
  const songCount    = await updateHeatSongs(bq);

  console.log(`\n=== Done: ${releaseCount} releases, ${songCount} songs updated ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
