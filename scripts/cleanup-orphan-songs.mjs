/**
 * cleanup-orphan-songs.mjs
 *
 * SONGSシート内で、ArtistsシートまたはLabel_Rosterシートに
 * 存在しないチャンネル由来の曲を検出・削除するスクリプト。
 *
 * Usage:
 *   node scripts/cleanup-orphan-songs.mjs          # ドライラン（削除しない）
 *   node scripts/cleanup-orphan-songs.mjs --delete  # 実際に削除
 *   node scripts/cleanup-orphan-songs.mjs --delete --sheet=SONGS_LONG  # SONGS_LONGも対象
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DRY_RUN = !process.argv.includes('--delete');
const TARGET_SHEET = process.argv.find(a => a.startsWith('--sheet='))?.split('=')[1] || 'SONGS';

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== Orphan Song Cleanup (${DRY_RUN ? 'DRY RUN' : 'LIVE DELETE'}) ===`);
  console.log(`Target sheet: ${TARGET_SHEET}\n`);

  // 1. Artistsシートから全チャンネル名を取得（A列=name）
  const artistsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A2:A',
  });
  const artistNames = new Set(
    (artistsRes.data.values || [])
      .map(r => (r[0] || '').trim())
      .filter(Boolean)
  );
  console.log(`Artists sheet: ${artistNames.size} channels`);

  // 2. Label_Rosterシートから全プロダクション名を取得（A列=prodName）
  const rosterRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Label_Roster!A2:A',
  });
  const rosterNames = new Set(
    (rosterRes.data.values || [])
      .map(r => (r[0] || '').trim())
      .filter(Boolean)
  );
  console.log(`Label_Roster sheet: ${rosterNames.size} productions`);

  // 有効なチャンネル名セット（ArtistsとLabel_Rosterの合計）
  const validChannels = new Set([...artistNames, ...rosterNames]);
  console.log(`Total valid channels: ${validChannels.size}\n`);

  // 3. SONGSシートの全曲を取得（A=videoId, B=artist）
  const songsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TARGET_SHEET}!A:J`,
  });
  const allRows = songsRes.data.values || [];
  if (allRows.length < 2) {
    console.log('No data found in sheet.');
    return;
  }

  const header = allRows[0];
  const dataRows = allRows.slice(1); // row 2 onwards

  console.log(`${TARGET_SHEET} sheet: ${dataRows.length} songs total`);

  // 4. 孤立曲を特定（artistがvalidChannelsに存在しない）
  const orphanRows = [];
  const orphanIndices = []; // 0-based index in dataRows

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const artist = (row[1] || '').trim(); // B列 = artist
    if (!artist) continue;
    if (!validChannels.has(artist)) {
      orphanRows.push({ rowNum: i + 2, videoId: row[0], artist, title: row[2] });
      orphanIndices.push(i);
    }
  }

  console.log(`\nOrphan songs (not in Artists or Label_Roster): ${orphanRows.length}`);

  if (orphanRows.length === 0) {
    console.log('No orphan songs found. Sheet is clean!');
    return;
  }

  // 孤立アーティスト一覧を集計
  const artistCounts = {};
  for (const r of orphanRows) {
    artistCounts[r.artist] = (artistCounts[r.artist] || 0) + 1;
  }

  console.log('\n--- Orphan artists (channel name → song count) ---');
  Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${count.toString().padStart(4)}  ${name}`));

  console.log('\n--- Sample orphan songs (first 20) ---');
  orphanRows.slice(0, 20).forEach(r =>
    console.log(`  Row ${r.rowNum}: [${r.artist}] ${r.title} (${r.videoId})`)
  );

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] ${orphanRows.length} songs would be deleted.`);
    console.log('Run with --delete flag to actually delete them.');
    return;
  }

  // 5. 実際に削除（後ろの行から削除してインデックスズレを防ぐ）
  console.log(`\nDeleting ${orphanRows.length} orphan songs...`);

  // スプレッドシートのシートIDを取得
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === TARGET_SHEET);
  if (!sheetMeta) {
    console.error(`Sheet "${TARGET_SHEET}" not found!`);
    return;
  }
  const sheetGid = sheetMeta.properties.sheetId;

  // 削除リクエストを後ろから順に構築（インデックスのズレ防止）
  const deleteRequests = orphanIndices
    .slice()
    .sort((a, b) => b - a) // 降順
    .map(i => ({
      deleteDimension: {
        range: {
          sheetId: sheetGid,
          dimension: 'ROWS',
          startIndex: i + 1, // +1 because row 0 is header
          endIndex: i + 2,
        },
      },
    }));

  // バッチで削除（一度に最大1000件）
  const BATCH_SIZE = 500;
  for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
    const batch = deleteRequests.slice(i, i + BATCH_SIZE);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: batch },
    });
    console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows`);
  }

  console.log(`\nDone! Deleted ${orphanRows.length} orphan songs from ${TARGET_SHEET}.`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
