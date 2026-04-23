/**
 * cleanup-long-songs.mjs
 *
 * YouTube APIで動画の長さを確認し、MAX_DURATION_SEC を超える曲を
 * SONGS / SONGS_LONG から削除する。
 * また、RANKING_DAILY / RANKING_WEEKLY / RANKING_AI_TEST の同 videoId 行も削除。
 *
 * Usage:
 *   node scripts/cleanup-long-songs.mjs                          # ドライラン
 *   node scripts/cleanup-long-songs.mjs --write                  # 削除実行
 *   node scripts/cleanup-long-songs.mjs --write --sheet=SONGS    # SONGS のみ
 *   node scripts/cleanup-long-songs.mjs --write --max=600        # 閾値を600秒に変更
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_WRITE   = process.argv.includes('--write');
const SHEET_ARG  = process.argv.find(a => a.startsWith('--sheet='));
const MAX_ARG    = process.argv.find(a => a.startsWith('--max='));
const TARGET_SHEETS = SHEET_ARG
  ? [SHEET_ARG.split('=')[1]]
  : ['SONGS', 'SONGS_LONG'];
const MAX_DURATION_SEC = MAX_ARG ? parseInt(MAX_ARG.split('=')[1]) : 600;

const RANKING_SHEETS = [
  { name: 'RANKING_DAILY',   videoIdCol: 25 }, // Z列
  { name: 'RANKING_WEEKLY',  videoIdCol: 22 }, // W列
  { name: 'RANKING_AI_TEST', videoIdCol: 25 }, // Z列
];

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID    = getEnv('NEXT_PUBLIC_SHEET_ID');
const YOUTUBE_KEY = getEnv('YOUTUBE_API_KEY');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1]) || 0) * 3600
       + (parseInt(match[2]) || 0) * 60
       + (parseInt(match[3]) || 0);
}

function colLetter(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function fetchDurations(videoIds) {
  const durationMap = new Map();
  const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_KEY });

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    try {
      const res = await youtube.videos.list({
        part: ['contentDetails', 'snippet'],
        id: chunk,
        maxResults: 50,
      });
      for (const item of (res.data.items || [])) {
        durationMap.set(item.id, {
          duration: parseDuration(item.contentDetails?.duration),
          title: item.snippet?.title || '',
        });
      }
      // Videos not returned by API = deleted/private → mark as 0
      for (const id of chunk) {
        if (!durationMap.has(id)) durationMap.set(id, { duration: -1, title: '[deleted/private]' });
      }
    } catch (e) {
      console.warn(`  YouTube API error for chunk ${i}: ${e.message}`);
    }
    process.stdout.write(`  YouTube API: ${Math.min(i + 50, videoIds.length)}/${videoIds.length} checked\r`);
  }
  console.log('');
  return durationMap;
}

async function deleteRowsFromSheet(sheets, sheetName, rowIndices, spreadsheet) {
  if (rowIndices.length === 0) return;
  const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  if (!sheetMeta) { console.warn(`  Sheet "${sheetName}" not found`); return; }
  const sheetGid = sheetMeta.properties.sheetId;

  const deleteRequests = rowIndices
    .sort((a, b) => b - a) // bottom-to-top
    .map(i => ({
      deleteDimension: {
        range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
      },
    }));

  const BATCH = 500;
  for (let i = 0; i < deleteRequests.length; i += BATCH) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: deleteRequests.slice(i, i + BATCH) },
    });
  }
  console.log(`  ${sheetName}: ${rowIndices.length}件 削除完了`);
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== cleanup-long-songs (${DO_WRITE ? 'WRITE' : 'DRY RUN'}, max=${MAX_DURATION_SEC}s) ===\n`);

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });

  // Collect all long-video IDs across source sheets
  const longVideoIds = new Set();

  for (const sheetName of TARGET_SHEETS) {
    console.log(`\n--- ${sheetName} ---`);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:C`,
    });
    const rows = res.data.values || [];
    const videoIds = rows.map(r => (r[0] || '').trim()).filter(Boolean);

    console.log(`  ${videoIds.length}件 の videoId を取得`);
    const durationMap = await fetchDurations(videoIds);

    const toDelete = [];
    for (let i = 0; i < rows.length; i++) {
      const videoId = (rows[i][0] || '').trim();
      if (!videoId) continue;
      const info = durationMap.get(videoId);
      if (!info) continue;
      if (info.duration > MAX_DURATION_SEC) {
        const mins = Math.floor(info.duration / 60);
        const secs = info.duration % 60;
        toDelete.push({
          rowIndex: i + 1,   // 0-based data index
          videoId,
          title: info.title,
          duration: `${mins}:${String(secs).padStart(2, '0')}`,
        });
        longVideoIds.add(videoId);
      }
    }

    console.log(`  対象（>${MAX_DURATION_SEC}s）: ${toDelete.length}件`);
    toDelete.slice(0, 15).forEach(r =>
      console.log(`  Row${r.rowIndex + 1} [${r.duration}] ${r.videoId} "${r.title}"`)
    );
    if (toDelete.length > 15) console.log(`  ... 他 ${toDelete.length - 15}件`);

    if (DO_WRITE && toDelete.length > 0) {
      await deleteRowsFromSheet(sheets, sheetName, toDelete.map(r => r.rowIndex), spreadsheet);
    }
  }

  // Remove from RANKING sheets
  if (longVideoIds.size === 0) {
    console.log('\nRANKINGシート: 削除対象なし');
  } else {
    console.log(`\n--- RANKINGシート同期 (${longVideoIds.size}件の videoId) ---`);
    for (const { name, videoIdCol } of RANKING_SHEETS) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${name}!A2:${colLetter(videoIdCol)}`,
      });
      const rows = res.data.values || [];
      const toDelete = [];
      for (let i = 0; i < rows.length; i++) {
        const videoId = (rows[i][videoIdCol] || '').trim();
        if (longVideoIds.has(videoId)) {
          toDelete.push({ rowIndex: i + 1, videoId });
        }
      }
      console.log(`  ${name}: ${toDelete.length}件 削除対象`);
      toDelete.slice(0, 5).forEach(r => console.log(`    Row${r.rowIndex + 1} ${r.videoId}`));
      if (DO_WRITE && toDelete.length > 0) {
        await deleteRowsFromSheet(sheets, name, toDelete.map(r => r.rowIndex), spreadsheet);
      }
    }
  }

  if (!DO_WRITE) {
    console.log('\n[DRY RUN] 変更なし。--write で実行。');
  } else {
    console.log('\n完了');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
