/**
 * prune-by-duration-node.mjs
 * 既存SONGSシート + BigQuery songs_master から、尺が範囲外の動画を一括削除する。
 *
 * 対象: duration < 80s (短尺) または duration > 600s (長尺非楽曲)
 * 副作用なし: snapshots / rank_history は触らない（ranking JOIN が自然に除外する）
 *
 * 使い方:
 *   node scripts/prune-by-duration-node.mjs          # 実際に削除
 *   node scripts/prune-by-duration-node.mjs --dry-run # 確認のみ（削除しない）
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const DATASET_ID = 'heat_ranking';

const MIN_SEC = 80;
const MAX_SEC = 600;
const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials missing (GOOGLE_SERVICE_ACCOUNT_JSON or YOUTUBE_API_KEY)');
  process.exit(1);
}

const credentials = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '')
);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

function parseDuration(iso) {
  const m = (iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

async function pruneSheet(sheetName) {
  console.log(`\n--- Processing sheet: ${sheetName} ---`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A2:D`,
    valueRenderOption: 'FORMULA',
  });
  const rows = res.data.values || [];
  if (rows.length === 0) {
    console.log(`  No data in ${sheetName}.`);
    return [];
  }
  console.log(`  Rows found: ${rows.length}`);

  // Extract all non-empty videoIds
  const videoIds = [...new Set(rows.map(r => (r[0] || '').trim()).filter(Boolean))];
  console.log(`  Unique videoIds: ${videoIds.length}`);

  // Fetch durations from YouTube API in batches of 50
  const durationMap = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    process.stdout.write(`  Fetching durations... ${i}/${videoIds.length}\r`);
    try {
      const ytRes = await youtube.videos.list({ part: ['contentDetails'], id: chunk });
      for (const item of (ytRes.data.items || [])) {
        durationMap.set(item.id, parseDuration(item.contentDetails.duration));
      }
    } catch (e) {
      console.warn(`\n  YouTube API error (batch ${Math.floor(i/50)+1}): ${e.message}`);
    }
  }
  console.log(`\n  Durations fetched: ${durationMap.size}/${videoIds.length}`);

  // Classify rows
  const validRows = [];
  const removedIds = [];
  const removedDetails = [];

  for (const row of rows) {
    const videoId = (row[0] || '').trim();
    if (!videoId) continue;

    const dur = durationMap.get(videoId);
    if (dur === undefined) {
      removedIds.push(videoId);
      removedDetails.push({ videoId, dur: 'N/A', reason: '削除済み/非公開動画' });
      continue;
    }
    if (dur < MIN_SEC) {
      removedIds.push(videoId);
      removedDetails.push({ videoId, dur, reason: `短すぎる (${dur}s < ${MIN_SEC}s)` });
      continue;
    }
    if (dur > MAX_SEC) {
      removedIds.push(videoId);
      removedDetails.push({ videoId, dur, reason: `長すぎる (${dur}s > ${MAX_SEC}s)` });
      continue;
    }
    validRows.push(row);
  }

  console.log(`\n  有効: ${validRows.length}  除外: ${removedDetails.length}`);
  if (removedDetails.length > 0) {
    console.log('  除外リスト:');
    removedDetails.forEach(d => console.log(`    - ${d.videoId} [${d.dur}s] ${d.reason}`));
  }

  if (!DRY_RUN && removedIds.length > 0) {
    // Rewrite sheet: clear then write valid rows
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:D`,
    });
    if (validRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: validRows },
      });
    }
    console.log(`  ✅ ${sheetName} シート書き直し完了`);
  }

  return removedIds;
}

async function pruneBigQuery(removedIds) {
  if (removedIds.length === 0) return;
  console.log(`\n--- BigQuery songs_master クリーンアップ (${removedIds.length} IDs) ---`);

  const CHUNK = 500;
  for (let i = 0; i < removedIds.length; i += CHUNK) {
    const chunk = removedIds.slice(i, i + CHUNK);
    if (!DRY_RUN) {
      await bq.query({
        query: `DELETE FROM \`${DATASET_ID}.songs_master\` WHERE videoId IN UNNEST(@ids)`,
        params: { ids: chunk },
      });
      console.log(`  Deleted batch ${Math.floor(i/CHUNK)+1} (${chunk.length} rows)`);
    } else {
      console.log(`  [dry-run] Would delete batch ${Math.floor(i/CHUNK)+1} (${chunk.length} rows)`);
    }
  }
}

async function run() {
  console.log(`=== Duration Pruning (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`基準: ${MIN_SEC}秒 ≤ duration ≤ ${MAX_SEC}秒\n`);

  // Process SONGS (active, affects ranking)
  const removedFromSongs = await pruneSheet('SONGS');

  // Process SONGS_LONG (archive, doesn't affect ranking but keep clean)
  const removedFromLong = await pruneSheet('SONGS_LONG');

  // Deduplicate across both sheets
  const allRemovedIds = [...new Set([...removedFromSongs, ...removedFromLong])];

  await pruneBigQuery(allRemovedIds);

  console.log('\n=== 完了 ===');
  console.log(`SONGS 除外: ${removedFromSongs.length}`);
  console.log(`SONGS_LONG 除外: ${removedFromLong.length}`);
  console.log(`BQ songs_master 削除対象: ${allRemovedIds.length} 件`);
  if (DRY_RUN) {
    console.log('\n※ --dry-run モードのため実際の変更はありません。');
    console.log('  削除を実行するには: node scripts/prune-by-duration-node.mjs');
  }
}

run().catch(console.error);
