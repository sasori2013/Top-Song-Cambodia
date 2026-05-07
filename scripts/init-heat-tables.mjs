/**
 * Creates heat_songs and heat_artists tables in BigQuery.
 * These are HEAT's canonical identity tables — one row per unique song/artist,
 * bridging YouTube, Apple Music, Spotify, Deezer, ISRC, and future identifiers.
 *
 * Run once: node scripts/init-heat-tables.mjs
 * Re-running is safe (tables already exist → skipped).
 */

import { BigQuery } from '@google-cloud/bigquery';
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

const DATASET = 'heat_ranking';

const HEAT_SONGS_SCHEMA = [
  // Primary key
  { name: 'heat_id',           type: 'STRING',    mode: 'REQUIRED', description: 'HEAT song ID (KH-xxxxxxxxxx)' },
  // Canonical metadata (best-known title/artist, platform-agnostic)
  { name: 'canonical_title',   type: 'STRING',    mode: 'NULLABLE', description: 'Clean display title' },
  { name: 'canonical_artist',  type: 'STRING',    mode: 'NULLABLE', description: 'Primary artist name' },
  // Platform IDs (fill as collected)
  { name: 'youtube_video_id',  type: 'STRING',    mode: 'NULLABLE', description: 'YouTube videoId' },
  { name: 'apple_music_id',    type: 'STRING',    mode: 'NULLABLE', description: 'Apple Music track ID' },
  { name: 'spotify_id',        type: 'STRING',    mode: 'NULLABLE', description: 'Spotify track ID' },
  { name: 'deezer_id',         type: 'STRING',    mode: 'NULLABLE', description: 'Deezer track ID' },
  // Rights identifiers (fill later)
  { name: 'isrc',              type: 'STRING',    mode: 'NULLABLE', description: 'International Standard Recording Code' },
  { name: 'iswc',              type: 'STRING',    mode: 'NULLABLE', description: 'International Standard Work Code' },
  // Release metadata
  { name: 'release_date',      type: 'DATE',      mode: 'NULLABLE' },
  { name: 'album',             type: 'STRING',    mode: 'NULLABLE' },
  { name: 'artwork_url',       type: 'STRING',    mode: 'NULLABLE' },
  { name: 'genres',            type: 'STRING',    mode: 'NULLABLE', description: 'Comma-separated genre tags' },
  // Timestamps
  { name: 'created_at',        type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'updated_at',        type: 'TIMESTAMP', mode: 'REQUIRED' },
];

const HEAT_ARTISTS_SCHEMA = [
  // Primary key
  { name: 'heat_artist_id',         type: 'STRING',    mode: 'REQUIRED', description: 'HEAT artist ID (HA-xxxxxxxxxx)' },
  // Names
  { name: 'name',                   type: 'STRING',    mode: 'NULLABLE', description: 'Artist display name (Latin)' },
  { name: 'name_khmer',             type: 'STRING',    mode: 'NULLABLE', description: 'Artist name in Khmer script' },
  // Platform IDs (fill as collected)
  { name: 'youtube_channel_id',     type: 'STRING',    mode: 'NULLABLE' },
  { name: 'spotify_artist_id',      type: 'STRING',    mode: 'NULLABLE' },
  { name: 'apple_music_artist_id',  type: 'STRING',    mode: 'NULLABLE' },
  { name: 'deezer_artist_id',       type: 'STRING',    mode: 'NULLABLE' },
  // Profile
  { name: 'bio',                    type: 'STRING',    mode: 'NULLABLE', description: 'English biography' },
  { name: 'bio_khmer',              type: 'STRING',    mode: 'NULLABLE', description: 'Khmer biography' },
  { name: 'country',                type: 'STRING',    mode: 'NULLABLE', description: 'ISO 3166-1 alpha-2 country code' },
  { name: 'is_cambodian',           type: 'BOOL',      mode: 'NULLABLE' },
  { name: 'genres',                 type: 'STRING',    mode: 'NULLABLE', description: 'Comma-separated genre tags' },
  { name: 'profile_image_url',      type: 'STRING',    mode: 'NULLABLE' },
  // Social links (add more columns later via ALTER TABLE)
  { name: 'facebook_url',           type: 'STRING',    mode: 'NULLABLE' },
  { name: 'instagram_url',          type: 'STRING',    mode: 'NULLABLE' },
  { name: 'tiktok_url',             type: 'STRING',    mode: 'NULLABLE' },
  { name: 'website_url',            type: 'STRING',    mode: 'NULLABLE' },
  // Timestamps
  { name: 'created_at',             type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'updated_at',             type: 'TIMESTAMP', mode: 'REQUIRED' },
];

async function createTable(bq, tableId, schema, description) {
  const dataset = bq.dataset(DATASET);
  const table = dataset.table(tableId);
  const [exists] = await table.exists();

  if (exists) {
    console.log(`[init] ${tableId} already exists — skipped`);
    return;
  }

  await dataset.createTable(tableId, {
    schema,
    description,
  });
  console.log(`[init] Created: ${DATASET}.${tableId} (${schema.length} columns)`);
}

async function main() {
  const bq = getBQ();

  await createTable(
    bq,
    'heat_songs',
    HEAT_SONGS_SCHEMA,
    'HEAT canonical song identity — bridges YouTube, Apple Music, Spotify, Deezer, ISRC, ISWC',
  );

  await createTable(
    bq,
    'heat_artists',
    HEAT_ARTISTS_SCHEMA,
    'HEAT canonical artist profiles — bridges YouTube channel, Spotify, Apple Music, social links',
  );

  console.log('[init] Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
