/**
 * backfill-views-node.mjs
 *
 * songs_master で views が NULL の曲を YouTube API (videos.list) で一括取得し、
 * views / description / likes / comments を更新する。
 *
 * - 1回の実行で処理する上限: --limit=N（デフォルト 3000 曲 ≈ 60 API コール ≈ 60 ユニット）
 * - 再実行しても views が NULL の曲だけを対象にするので安全
 * - YouTube 削除済み動画は views=0 でマークしてスキップ対象外に
 *
 * 使い方:
 *   node scripts/backfill-views-node.mjs            # 最大 3000 曲
 *   node scripts/backfill-views-node.mjs --limit=500
 */

import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');

const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const PROJECT_ID     = getEnv('GCP_PROJECT_ID');
const DATASET_ID     = 'heat_ranking';

const BATCH_SIZE    = 50;     // YouTube API 上限
const DEFAULT_LIMIT = 3000;   // 1 実行あたりの上限曲数
const INTERVAL_MS   = 300;    // API コール間の待機

if (!YOUTUBE_API_KEY) { console.error('YOUTUBE_API_KEY が未設定'); process.exit(1); }

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const MAX_SONGS = limitArg ? parseInt(limitArg.split('=')[1]) : DEFAULT_LIMIT;

// ── BigQuery ──────────────────────────────────
const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

// ── YouTube ───────────────────────────────────
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── YouTube バッチ取得 ─────────────────────────
async function fetchVideoData(videoIds) {
  const res = await youtube.videos.list({
    part: ['statistics', 'snippet'],
    id: videoIds,
    maxResults: 50,
  });
  const map = {};
  for (const item of (res.data.items || [])) {
    map[item.id] = {
      views:       parseInt(item.statistics?.viewCount   || '0'),
      likes:       parseInt(item.statistics?.likeCount   || '0'),
      comments:    parseInt(item.statistics?.commentCount || '0'),
      description: item.snippet?.description || '',
      title:       item.snippet?.title || '',
    };
  }
  return map;
}

// ── BigQuery バルク UPDATE（TEMP TABLE 経由）────
async function bulkUpdate(rows) {
  if (rows.length === 0) return;

  // 一時テーブルを作って MERGE
  const tempId = `_backfill_views_temp_${Date.now()}`;
  const ndjson = rows.map(r => JSON.stringify({
    videoId:     r.videoId,
    views:       r.views,
    description: r.description,
  })).join('\n');

  const os = await import('os');
  const fs = await import('fs');
  const tmpFile = join(os.tmpdir(), `${tempId}.json`);
  fs.writeFileSync(tmpFile, ndjson);

  await bq.dataset(DATASET_ID).table(tempId).load(tmpFile, {
    sourceFormat: 'NEWLINE_DELIMITED_JSON',
    schema: { fields: [
      { name: 'videoId',     type: 'STRING' },
      { name: 'views',       type: 'INT64'  },
      { name: 'description', type: 'STRING' },
    ]},
  });

  await bq.query(`
    MERGE \`${DATASET_ID}.songs_master\` T
    USING \`${DATASET_ID}.${tempId}\` S ON T.videoId = S.videoId
    WHEN MATCHED THEN UPDATE SET
      T.views       = S.views,
      T.description = IF(T.description IS NULL OR T.description = '', S.description, T.description)
  `);

  await bq.dataset(DATASET_ID).table(tempId).delete();
  fs.unlinkSync(tmpFile);
}

// ── メイン ────────────────────────────────────
console.log(`=== backfill-views 開始 (最大 ${MAX_SONGS} 曲) ===`);

const [nullRows] = await bq.query(`
  SELECT videoId FROM \`${DATASET_ID}.songs_master\`
  WHERE views IS NULL
  ORDER BY publishedAt DESC
  LIMIT ${MAX_SONGS}
`);

if (nullRows.length === 0) {
  console.log('✓ views 未取得の曲はありません');
  process.exit(0);
}

// 残り総数
const [remaining] = await bq.query(
  `SELECT COUNT(*) as cnt FROM \`${DATASET_ID}.songs_master\` WHERE views IS NULL`
);
console.log(`今回処理: ${nullRows.length} 曲 / 未取得残り合計: ${remaining[0].cnt} 曲`);

const allIds   = nullRows.map(r => r.videoId);
const batches  = [];
for (let i = 0; i < allIds.length; i += BATCH_SIZE) batches.push(allIds.slice(i, i + BATCH_SIZE));

let updatedCount  = 0;
let deletedCount  = 0;
let apiCalls      = 0;
const pendingRows = [];

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  try {
    const dataMap = await fetchVideoData(batch);
    apiCalls++;

    for (const id of batch) {
      if (dataMap[id]) {
        pendingRows.push({ videoId: id, ...dataMap[id] });
        updatedCount++;
      } else {
        // YouTube から削除済み → views=0 でマーク（再スキャン対象外に）
        pendingRows.push({ videoId: id, views: 0, likes: 0, comments: 0, description: '' });
        deletedCount++;
      }
    }

    // 500 曲溜まったら一括書き込み（メモリ節約）
    if (pendingRows.length >= 500) {
      try {
        await bulkUpdate(pendingRows.splice(0));
      } catch (e) {
        console.error('\nbulkUpdate エラー:', e.message);
      }
    }

    const pct = Math.round(((i + 1) / batches.length) * 100);
    process.stdout.write(`\r[${pct}%] 更新:${updatedCount} 削除済み:${deletedCount} APIコール:${apiCalls}`);

    if (i < batches.length - 1) await sleep(INTERVAL_MS);
  } catch (err) {
    console.error(`\nバッチ ${i} エラー:`, err.message);
    await sleep(3000);
  }
}

// 残りを書き込み
if (pendingRows.length > 0) {
  try {
    await bulkUpdate(pendingRows);
  } catch (e) {
    console.error('\n最終bulkUpdateエラー:', e.message);
  }
}

console.log(`\n\n=== 完了 ===`);
console.log(`更新:       ${updatedCount} 曲`);
console.log(`削除済みマーク: ${deletedCount} 曲`);
console.log(`使用APIユニット: ~${apiCalls} ユニット`);

const [afterRemaining] = await bq.query(
  `SELECT COUNT(*) as cnt FROM \`${DATASET_ID}.songs_master\` WHERE views IS NULL`
);
console.log(`まだ views 未取得: ${afterRemaining[0].cnt} 曲`);
if (afterRemaining[0].cnt > 0) {
  const moreCalls = Math.ceil(afterRemaining[0].cnt / BATCH_SIZE);
  console.log(`→ あと ~${moreCalls} API コール (${moreCalls} ユニット) で完了します`);
  console.log('  node scripts/backfill-views-node.mjs を再実行してください');
}
