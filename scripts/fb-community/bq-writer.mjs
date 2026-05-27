import { createHash } from 'crypto';
import { BigQuery } from '@google-cloud/bigquery';

const DATASET = 'heat_ranking';
const TABLE   = 'fb_posts';

const SCHEMA = [
  { name: 'post_url',      type: 'STRING',    mode: 'REQUIRED' },
  { name: 'phase',         type: 'INT64',     mode: 'REQUIRED' }, // 0, 3, 6
  { name: 'artist_id',     type: 'STRING',    mode: 'NULLABLE' }, // artists_master.channelId
  { name: 'song_id',       type: 'STRING',    mode: 'NULLABLE' }, // heat_songs.youtube_video_id (single only)
  { name: 'release_id',    type: 'STRING',    mode: 'NULLABLE' }, // heat_releases.release_id (album/EP)
  { name: 'album_name',    type: 'STRING',    mode: 'NULLABLE' },
  { name: 'fb_page_url',   type: 'STRING',    mode: 'NULLABLE' },
  { name: 'fb_video_url',  type: 'STRING',    mode: 'NULLABLE' }, // native FB video URL
  { name: 'post_text',     type: 'STRING',    mode: 'NULLABLE' },
  { name: 'post_date',     type: 'TIMESTAMP', mode: 'NULLABLE' },
  { name: 'scraped_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'views',         type: 'INT64',     mode: 'NULLABLE' }, // FB video views (null for non-video posts)
  { name: 'reactions',     type: 'INT64',     mode: 'NULLABLE' },
  { name: 'comments',      type: 'INT64',     mode: 'NULLABLE' },
  { name: 'shares',        type: 'INT64',     mode: 'NULLABLE' },
  { name: 'youtube_links', type: 'STRING',    mode: 'NULLABLE' }, // comma-separated video IDs
  { name: 'ai_category',   type: 'STRING',    mode: 'NULLABLE' }, // new_release|yt_share|promo|unrelated
  { name: 'ai_confidence', type: 'FLOAT64',   mode: 'NULLABLE' },
];

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

async function ensureTable(bq) {
  const table = bq.dataset(DATASET).table(TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: SCHEMA,
      // Partition by scraped_at so old data is cheap to query/delete
      timePartitioning: { type: 'DAY', field: 'scraped_at' },
      clustering: { fields: ['phase', 'ai_category'] },
    });
    console.log(`[BQ] Created table ${DATASET}.${TABLE}`);
  }
  return table;
}

function insertId(postUrl, phase) {
  return createHash('sha256').update(`${postUrl}__phase${phase}`).digest('hex').slice(0, 32);
}

export async function writePosts(posts) {
  if (posts.length === 0) {
    console.log('[BQ] No fb_posts to write');
    return;
  }

  const bq = createBQ();
  const table = await ensureTable(bq);
  const now = new Date().toISOString();

  const rows = posts.map(p => ({
    insertId: insertId(p.post_url, p.phase),
    json: {
      post_url:      p.post_url,
      phase:         p.phase,
      artist_id:     p.artist_id     || null,
      song_id:       p.song_id       || null,
      release_id:    p.release_id    || null,
      album_name:    p.album_name    || null,
      fb_page_url:   p.fb_page_url   || null,
      fb_video_url:  p.fb_video_url  || null,
      post_text:     (p.post_text || '').slice(0, 4096) || null,
      post_date:     p.post_date     || null,
      scraped_at:    now,
      views:         p.views         ?? null,
      reactions:     p.reactions     ?? null,
      comments:      p.comments      ?? null,
      shares:        p.shares        ?? null,
      youtube_links: p.youtube_links?.length ? p.youtube_links.join(',') : null,
      ai_category:   p.ai_category   || null,
      ai_confidence: p.ai_confidence ?? null,
    },
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await table.insert(rows.slice(i, i + BATCH), { raw: true });
  }
  console.log(`[BQ] Inserted ${rows.length} rows to ${DATASET}.${TABLE} (phase=${posts[0]?.phase})`);
}

/**
 * Returns post_urls that need a revisit for the given phase (3 or 6).
 * A revisit is due when the phase-0 row was scraped (phase-days) ago
 * and no row yet exists for the target phase.
 */
export async function getPostsForRevisit(bq, phase) {
  const daysAgo = phase; // phase 3 → 3 days ago, phase 6 → 6 days ago
  const query = `
    SELECT DISTINCT p0.post_url, p0.artist_id, p0.song_id, p0.release_id, p0.album_name, p0.fb_page_url, p0.fb_video_url
    FROM \`${DATASET}.${TABLE}\` p0
    WHERE p0.phase = 0
      AND DATE(p0.scraped_at, 'Asia/Phnom_Penh') = DATE_SUB(
            CURRENT_DATE('Asia/Phnom_Penh'), INTERVAL ${daysAgo} DAY)
      AND NOT EXISTS (
        SELECT 1 FROM \`${DATASET}.${TABLE}\` p1
        WHERE p1.post_url = p0.post_url
          AND p1.phase = ${phase}
      )
  `;
  const [rows] = await bq.query({ query });
  return rows;
}

export { createBQ };
