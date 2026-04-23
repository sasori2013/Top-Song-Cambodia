/**
 * fix-artist-names.mjs
 *
 * SONGSシートのartist列をArtists/Label_Rosterを正解として修正する。
 *
 * 処理フロー:
 *   1. Artists!A(name), C(channelId) と Label_Roster!A(prodName) を取得
 *   2. SONGSのartistが正解と一致しない曲（孤立曲）を抽出
 *   3. videoId → YouTube API → channelId で照合
 *      - channelIdがArtistsにあれば → artist名を正式名に修正
 *      - channelIdがArtistsにない  → 真の孤立曲（削除候補）
 *   4. ドライランで結果表示 → --fix / --delete フラグで実行
 *
 * Usage:
 *   node scripts/fix-artist-names.mjs              # ドライラン（確認のみ）
 *   node scripts/fix-artist-names.mjs --fix        # 名前修正のみ実行
 *   node scripts/fix-artist-names.mjs --delete     # 孤立曲削除のみ実行
 *   node scripts/fix-artist-names.mjs --fix --delete  # 修正＋削除を両方実行
 *   node scripts/fix-artist-names.mjs --fix --delete --sheet=SONGS_LONG
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_FIX    = process.argv.includes('--fix');
const DO_DELETE = process.argv.includes('--delete');
const TARGET_SHEET = process.argv.find(a => a.startsWith('--sheet='))?.split('=')[1] || 'SONGS';
const DRY_RUN = !DO_FIX && !DO_DELETE;

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID      = getEnv('NEXT_PUBLIC_SHEET_ID');
const YOUTUBE_KEY   = getEnv('YOUTUBE_API_KEY');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// YouTube API: videoIdのリスト(最大50件)からchannelIdを取得
async function fetchChannelIds(videoIds) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}&key=${YOUTUBE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const map = {};
  for (const item of (data.items || [])) {
    map[item.id] = {
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
    };
  }
  return map;
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== fix-artist-names (${DRY_RUN ? 'DRY RUN' : `${DO_FIX?'FIX ':''}${DO_DELETE?'DELETE':''}`}) ===`);
  console.log(`Target: ${TARGET_SHEET}\n`);

  // --- 1. Artists シート（A=name, C=channelId）---
  const arRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A2:C',
  });
  const artistRows = arRes.data.values || [];

  // channelId → official name
  const channelIdToName = {};
  // official name セット（大文字小文字・空白正規化済み）
  const officialNameSet = new Set();

  for (const r of artistRows) {
    const name      = (r[0] || '').trim();
    const channelId = (r[2] || '').trim();
    if (name)      officialNameSet.add(name);
    if (channelId) channelIdToName[channelId] = name;
  }
  console.log(`Artists: ${officialNameSet.size} names, ${Object.keys(channelIdToName).length} channelIds`);

  // --- 2. Label_Roster（A=prodName）---
  const rrRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Label_Roster!A2:A',
  });
  const rosterProdSet = new Set(
    (rrRes.data.values || []).map(r => (r[0] || '').trim()).filter(Boolean)
  );
  console.log(`Label_Roster productions: ${rosterProdSet.size}`);

  const validNames = new Set([...officialNameSet, ...rosterProdSet]);

  // --- 3. SONGS シート取得 ---
  const soRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TARGET_SHEET}!A:J`,
  });
  const allRows = soRes.data.values || [];
  const dataRows = allRows.slice(1); // ヘッダー除く
  console.log(`\n${TARGET_SHEET}: ${dataRows.length} songs total`);

  // --- 4. 孤立曲を特定 ---
  const orphans = [];
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const artist = (r[1] || '').trim();
    if (!artist) continue;
    if (!validNames.has(artist)) {
      orphans.push({ rowIndex: i, videoId: r[0], artist, title: r[2] });
    }
  }
  console.log(`Orphan songs (artist not in Artists/Label_Roster): ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('\nAll songs already have valid artist names!');
    return;
  }

  // --- 5. YouTube API で channelId 取得（50件ずつ）---
  console.log('\nFetching channelIds from YouTube API...');
  const videoIdToChannel = {};
  const validVideoIds = orphans.map(o => o.videoId).filter(Boolean);
  const BATCH = 50;
  for (let i = 0; i < validVideoIds.length; i += BATCH) {
    const batch = validVideoIds.slice(i, i + BATCH);
    try {
      const result = await fetchChannelIds(batch);
      Object.assign(videoIdToChannel, result);
      process.stdout.write(`  ${Math.min(i + BATCH, validVideoIds.length)}/${validVideoIds.length}\r`);
    } catch (e) {
      console.warn(`  Batch ${i}-${i+BATCH} failed: ${e.message}`);
    }
  }
  console.log(`\nFetched channel info for ${Object.keys(videoIdToChannel).length} videos`);

  // --- 6. 仕分け ---
  const toFix     = []; // channelIdがArtistsにある → 名前修正
  const toDelete  = []; // channelIdがArtistsにない → 削除候補
  const notFound  = []; // YouTube APIから情報取れなかった（削除済み動画など）

  for (const orphan of orphans) {
    const info = videoIdToChannel[orphan.videoId];
    if (!info) {
      notFound.push(orphan);
      continue;
    }
    const officialName = channelIdToName[info.channelId];
    if (officialName) {
      toFix.push({ ...orphan, channelId: info.channelId, officialName, ytChannelTitle: info.channelTitle });
    } else {
      toDelete.push({ ...orphan, channelId: info.channelId, ytChannelTitle: info.channelTitle });
    }
  }

  // --- 7. 結果レポート ---
  console.log(`\n--- 結果サマリ ---`);
  console.log(`  修正対象（名前ゆれ → 正式名に更新）: ${toFix.length} 曲`);
  console.log(`  削除対象（無関係チャンネル）       : ${toDelete.length} 曲`);
  console.log(`  情報取得不可（削除済み動画など）   : ${notFound.length} 曲`);

  if (toFix.length > 0) {
    console.log('\n--- 名前修正リスト ---');
    const fixGroups = {};
    for (const f of toFix) {
      const key = `"${f.artist}" → "${f.officialName}"`;
      fixGroups[key] = (fixGroups[key] || 0) + 1;
    }
    Object.entries(fixGroups).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
      console.log(`  ${v.toString().padStart(3)}曲  ${k}`)
    );
  }

  if (toDelete.length > 0) {
    console.log('\n--- 削除対象チャンネル別 ---');
    const delGroups = {};
    for (const d of toDelete) {
      const key = `${d.ytChannelTitle} (${d.channelId})`;
      delGroups[key] = (delGroups[key] || 0) + 1;
    }
    Object.entries(delGroups).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
      console.log(`  ${v.toString().padStart(3)}曲  ${k}`)
    );
    console.log('\n--- 削除対象サンプル (first 15) ---');
    toDelete.slice(0, 15).forEach(d =>
      console.log(`  Row${d.rowIndex+2}: [${d.ytChannelTitle}] ${d.title}`)
    );
  }

  if (notFound.length > 0) {
    console.log('\n--- 情報取得不可（削除推奨） ---');
    notFound.slice(0, 10).forEach(d =>
      console.log(`  Row${d.rowIndex+2}: [${d.artist}] ${d.title} (${d.videoId})`)
    );
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 変更は行いませんでした。');
    console.log('  --fix    : 名前修正を実行');
    console.log('  --delete : 孤立曲削除を実行（情報取得不可の曲も削除）');
    return;
  }

  // スプレッドシートのシートIDを取得（行削除に必要）
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === TARGET_SHEET);
  if (!sheetMeta) throw new Error(`Sheet "${TARGET_SHEET}" not found`);
  const sheetGid = sheetMeta.properties.sheetId;

  // --- 8. 名前修正（--fix）---
  if (DO_FIX && toFix.length > 0) {
    console.log(`\n[FIX] ${toFix.length}曲のartist名を修正中...`);
    const updateData = toFix.map(f => ({
      range: `${TARGET_SHEET}!B${f.rowIndex + 2}`,
      values: [[f.officialName]],
    }));
    const UBATCH = 500;
    for (let i = 0; i < updateData.length; i += UBATCH) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updateData.slice(i, i + UBATCH),
        },
      });
      console.log(`  Updated ${Math.min(i + UBATCH, updateData.length)}/${updateData.length}`);
    }
    console.log('[FIX] 完了');
  }

  // --- 9. 削除（--delete）---
  if (DO_DELETE) {
    const deleteTargets = [...toDelete, ...notFound];
    if (deleteTargets.length === 0) {
      console.log('\n[DELETE] 削除対象なし');
    } else {
      console.log(`\n[DELETE] ${deleteTargets.length}曲を削除中...`);
      const deleteRequests = deleteTargets
        .map(d => d.rowIndex)
        .sort((a, b) => b - a) // 後ろから削除してズレ防止
        .map(i => ({
          deleteDimension: {
            range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: i + 1, endIndex: i + 2 },
          },
        }));
      const DBATCH = 500;
      for (let i = 0; i < deleteRequests.length; i += DBATCH) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { requests: deleteRequests.slice(i, i + DBATCH) },
        });
        console.log(`  Deleted ${Math.min(i + DBATCH, deleteRequests.length)}/${deleteRequests.length}`);
      }
      console.log('[DELETE] 完了');
    }
  }

  console.log('\n=== 処理完了 ===');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
