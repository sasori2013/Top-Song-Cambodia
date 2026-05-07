/**
 * Populates heat_songs and heat_artists from existing BQ tables.
 *
 * heat_songs  ← songs_master (youtube_video_id as anchor)
 *              + platform_rankings (apple_music_id / spotify_id where youtube_video_id matches)
 *
 * heat_artists ← artists_master (youtube_channel_id as anchor)
 *
 * HEAT ID generation (deterministic):
 *   HS-<10-hex>  = SHA-256 of videoId (or apple_music_id if no videoId)
 *   HA-<10-hex>  = SHA-256 of channelId (or lowercase name if no channelId)
 *
 * Run: node scripts/migrate-heat-ids.mjs
 * Re-running is safe — uses INSERT … SELECT WHERE NOT EXISTS pattern.
 */

import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');

function getBQ() {
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: PROJECT_ID, credentials });
}

function heatId(prefix, input) {
  return `${prefix}-${crypto.createHash('sha256').update(input).digest('hex').slice(0, 10)}`;
}

const DS = 'heat_ranking';

async function migrateSongs(bq) {
  console.log('[migrate] Loading songs_master...');
  const [rows] = await bq.query(`
    SELECT
      videoId,
      COALESCE(NULLIF(cleanTitle, ''), title) AS title,
      artist,
      publishedAt
    FROM \`${DS}.songs_master\`
    WHERE videoId IS NOT NULL
  `);

  // Collect platform IDs from platform_rankings (latest per youtube_video_id)
  console.log('[migrate] Loading platform_rankings platform IDs...');
  const [prRows] = await bq.query(`
    SELECT
      youtube_video_id,
      MAX(IF(platform = 'apple_music', track_id, NULL)) AS apple_music_id,
      MAX(IF(platform = 'spotify',     track_id, NULL)) AS spotify_id,
      MAX(artwork_url)  AS artwork_url,
      MAX(album)        AS album,
      MAX(genre)        AS genres
    FROM \`${DS}.platform_rankings\`
    WHERE youtube_video_id IS NOT NULL AND youtube_video_id != ''
    GROUP BY youtube_video_id
  `);

  const platformMap = new Map(prRows.map(r => [r.youtube_video_id, r]));

  // Build rows for heat_songs
  const now = new Date().toISOString();
  const insertRows = rows.map(r => {
    const id = heatId('KH', r.videoId);
    const pr = platformMap.get(r.videoId) || {};
    return {
      heat_id:           id,
      canonical_title:   r.title || null,
      canonical_artist:  r.artist || null,
      youtube_video_id:  r.videoId,
      apple_music_id:    pr.apple_music_id || null,
      spotify_id:        pr.spotify_id || null,
      deezer_id:         null,
      isrc:              null,
      iswc:              null,
      release_date:      r.publishedAt ? r.publishedAt.value?.split('T')[0] ?? null : null,
      album:             pr.album || null,
      artwork_url:       pr.artwork_url || null,
      genres:            pr.genres || null,
      created_at:        now,
      updated_at:        now,
    };
  });

  // Also seed platform-only songs (ranked but not yet in songs_master)
  const [platformOnly] = await bq.query(`
    SELECT
      track_id, title, artist, platform, artwork_url, album, genre,
      MAX(IF(platform = 'apple_music', track_id, NULL)) OVER (PARTITION BY title, artist) AS apple_music_id,
      MAX(IF(platform = 'spotify',     track_id, NULL)) OVER (PARTITION BY title, artist) AS spotify_id,
      ROW_NUMBER() OVER (PARTITION BY title, artist ORDER BY date DESC) AS rn
    FROM \`${DS}.platform_rankings\`
    WHERE (youtube_video_id IS NULL OR youtube_video_id = '')
  `);

  const seenPlatform = new Map();
  for (const r of platformOnly) {
    if (r.rn !== 1) continue;
    const key = `${(r.title || '').toLowerCase()}||${(r.artist || '').toLowerCase()}`;
    if (seenPlatform.has(key)) continue;
    seenPlatform.set(key, true);
    const anchor = r.apple_music_id || r.spotify_id || r.track_id || key;
    insertRows.push({
      heat_id:           heatId('KH', anchor),
      canonical_title:   r.title || null,
      canonical_artist:  r.artist || null,
      youtube_video_id:  null,
      apple_music_id:    r.apple_music_id || (r.platform === 'apple_music' ? r.track_id : null),
      spotify_id:        r.spotify_id     || (r.platform === 'spotify'     ? r.track_id : null),
      deezer_id:         null,
      isrc:              null,
      iswc:              null,
      release_date:      null,
      album:             r.album || null,
      artwork_url:       r.artwork_url || null,
      genres:            r.genre || null,
      created_at:        now,
      updated_at:        now,
    });
  }

  // Deduplicate by heat_id before inserting
  const unique = new Map(insertRows.map(r => [r.heat_id, r]));
  const finalRows = [...unique.values()];

  // Load existing heat_ids to skip
  const [existing] = await bq.query(`SELECT heat_id FROM \`${DS}.heat_songs\``);
  const existingSet = new Set(existing.map(r => r.heat_id));

  const newRows = finalRows.filter(r => !existingSet.has(r.heat_id));
  if (newRows.length === 0) {
    console.log('[migrate] heat_songs: nothing new to insert');
    return;
  }

  // Insert in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < newRows.length; i += BATCH) {
    await bq.dataset(DS).table('heat_songs').insert(newRows.slice(i, i + BATCH));
    inserted += Math.min(BATCH, newRows.length - i);
  }
  console.log(`[migrate] heat_songs: inserted ${inserted} rows (${existingSet.size} already existed)`);
}

async function migrateArtists(bq) {
  console.log('[migrate] Loading artists_master...');
  const [rows] = await bq.query(`
    SELECT name, channelId, bio, genres, facebook, links, type
    FROM \`${DS}.artists_master\`
    WHERE name IS NOT NULL AND name != ''
  `);

  const [existing] = await bq.query(`SELECT heat_artist_id FROM \`${DS}.heat_artists\``);
  const existingSet = new Set(existing.map(r => r.heat_artist_id));

  const now = new Date().toISOString();
  const insertRows = [];

  for (const r of rows) {
    const anchor = r.channelId || r.name.toLowerCase();
    const id = heatId('HA', anchor);
    if (existingSet.has(id)) continue;

    insertRows.push({
      heat_artist_id:       id,
      name:                 r.name || null,
      name_khmer:           null,
      youtube_channel_id:   r.channelId || null,
      spotify_artist_id:    null,
      apple_music_artist_id: null,
      deezer_artist_id:     null,
      bio:                  r.bio || null,
      bio_khmer:            null,
      country:              'KH',
      is_cambodian:         true,
      genres:               r.genres || null,
      profile_image_url:    null,
      facebook_url:         r.facebook || null,
      instagram_url:        null,
      tiktok_url:           null,
      website_url:          null,
      created_at:           now,
      updated_at:           now,
    });
  }

  if (insertRows.length === 0) {
    console.log('[migrate] heat_artists: nothing new to insert');
    return;
  }

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += BATCH) {
    await bq.dataset(DS).table('heat_artists').insert(insertRows.slice(i, i + BATCH));
    inserted += Math.min(BATCH, insertRows.length - i);
  }
  console.log(`[migrate] heat_artists: inserted ${inserted} rows`);
}

async function main() {
  const bq = getBQ();
  await migrateSongs(bq);
  await migrateArtists(bq);
  console.log('[migrate] Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
