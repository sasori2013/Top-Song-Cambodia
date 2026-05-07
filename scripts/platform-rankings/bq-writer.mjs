import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'platform_rankings';
const RAW_TABLE_ID = 'platform_rankings_raw';

const RAW_TABLE_SCHEMA = [
  { name: 'date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
  { name: 'rank', type: 'INT64', mode: 'REQUIRED' },
  { name: 'track_id', type: 'STRING' },
  { name: 'title', type: 'STRING' },
  { name: 'artist', type: 'STRING' },
  { name: 'url', type: 'STRING' },
  { name: 'artwork_url', type: 'STRING' },
  { name: 'album', type: 'STRING' },
  { name: 'genre', type: 'STRING' },
  { name: 'is_khmer', type: 'BOOL' },
  { name: 'collected_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

const TABLE_SCHEMA = [
  { name: 'date', type: 'DATE', mode: 'REQUIRED' },
  { name: 'platform', type: 'STRING', mode: 'REQUIRED' },
  { name: 'rank', type: 'INT64', mode: 'REQUIRED' },
  { name: 'track_id', type: 'STRING' },
  { name: 'title', type: 'STRING' },
  { name: 'artist', type: 'STRING' },
  { name: 'url', type: 'STRING' },
  { name: 'artwork_url', type: 'STRING' },
  { name: 'album', type: 'STRING' },
  { name: 'genre', type: 'STRING' },
  { name: 'is_khmer', type: 'BOOL' },
  { name: 'youtube_video_id', type: 'STRING' },
  { name: 'youtube_match_score', type: 'FLOAT64' },
  { name: 'filter_reason', type: 'STRING' },
  { name: 'collected_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

async function ensureTable(bq) {
  const table = bq.dataset(DATASET_ID).table(TABLE_ID);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: TABLE_SCHEMA,
      timePartitioning: { type: 'DAY', field: 'date' },
      clustering: { fields: ['platform', 'is_khmer'] },
    });
    console.log(`[BQ] Created table ${DATASET_ID}.${TABLE_ID}`);
  }
  return table;
}

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: PROJECT_ID, credentials });
}

export async function writeToBigQuery({ appleMusic, spotify }) {
  const bq = createBQ();
  const table = await ensureTable(bq);

  const today = new Date().toISOString().split('T')[0];

  // Build insert rows with insertId for deduplication
  // BQ deduplicates streaming inserts sharing the same insertId within a time window.
  // This avoids DELETE on the streaming buffer (which BQ does not allow).
  const rows = [
    ...(appleMusic || []),
    ...(spotify || []),
  ].map(s => ({
    insertId: `${s.date}-${s.platform}-${s.rank}`,
    json: {
      date: s.date,
      platform: s.platform,
      rank: s.rank,
      track_id: s.track_id || null,
      title: s.title || null,
      artist: s.artist || null,
      url: s.url || null,
      artwork_url: s.artwork_url || null,
      album: s.album || null,
      genre: s.genre || null,
      is_khmer: true,
      youtube_video_id: s.youtube_video_id || null,
      youtube_match_score: s.youtube_match_score ?? null,
      filter_reason: s._reason || null,
      collected_at: s.collected_at,
    },
  }));

  if (rows.length === 0) {
    console.log('[BQ] No rows to insert');
    return;
  }

  // Insert in batches of 500 with deduplication via insertId
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await table.insert(rows.slice(i, i + BATCH), { raw: true });
  }

  console.log(`[BQ] Inserted ${rows.length} rows to ${DATASET_ID}.${TABLE_ID}`);
}

export async function writeRawToBigQuery(allRawSongs) {
  const bq = createBQ();
  if (!allRawSongs || allRawSongs.length === 0) return;

  const rawTable = bq.dataset(DATASET_ID).table(RAW_TABLE_ID);
  const [exists] = await rawTable.exists();
  if (!exists) {
    await rawTable.create({
      schema: RAW_TABLE_SCHEMA,
      timePartitioning: { type: 'DAY', field: 'date' },
      clustering: { fields: ['platform', 'is_khmer'] },
    });
    console.log(`[BQ] Created table ${DATASET_ID}.${RAW_TABLE_ID}`);
  }

  const rows = allRawSongs.map(s => ({
    insertId: `raw-${s.date}-${s.platform}-${s.rank}`,
    json: {
      date: s.date,
      platform: s.platform,
      rank: s.rank,
      track_id: s.track_id || null,
      title: s.title || null,
      artist: s.artist || null,
      url: s.url || null,
      artwork_url: s.artwork_url || null,
      album: s.album || null,
      genre: s.genre || null,
      is_khmer: s.is_khmer ?? false,
      collected_at: s.collected_at,
    },
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await rawTable.insert(rows.slice(i, i + BATCH), { raw: true });
  }
  console.log(`[BQ] Inserted ${rows.length} rows to ${DATASET_ID}.${RAW_TABLE_ID}`);
}
