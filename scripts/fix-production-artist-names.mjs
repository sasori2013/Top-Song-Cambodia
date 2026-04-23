/**
 * fix-production-artist-names.mjs
 *
 * SONGSシートのartist列（B）がプロダクション名になっている曲を修正する。
 * - detectedArtist（H列）がある → artist = detectedArtist
 * - detectedArtist がない → Label_Rosterのキーワードで曲名からアーティストを特定
 *
 * Usage:
 *   node scripts/fix-production-artist-names.mjs            # ドライラン
 *   node scripts/fix-production-artist-names.mjs --fix      # 実行
 *   node scripts/fix-production-artist-names.mjs --fix --sheet=SONGS_LONG
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_FIX = process.argv.includes('--fix');
const TARGET_SHEET = process.argv.find(a => a.startsWith('--sheet='))?.split('=')[1] || 'SONGS';

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== fix-production-artist-names (${DO_FIX ? 'FIX' : 'DRY RUN'}) ===`);
  console.log(`Target: ${TARGET_SHEET}\n`);

  // 1. P型プロダクション名セット
  const arRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:F' });
  const prodNames = new Set(
    (arRes.data.values || [])
      .filter(r => ['P', 'Production', 'Label'].includes((r[5] || '').trim()))
      .map(r => (r[0] || '').trim())
      .filter(Boolean)
  );
  console.log(`Productions: ${[...prodNames].join(', ')}`);

  // 2. Label_Roster: prodName → [{targetArtist, keywords[]}]
  const rrRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A2:C' });
  const rosterMap = new Map();
  for (const r of (rrRes.data.values || [])) {
    const prod = (r[0] || '').trim();
    const target = (r[1] || '').trim();
    const kws = (r[2] || '').trim();
    if (!prod || !target || !kws) continue;
    if (!rosterMap.has(prod)) rosterMap.set(prod, []);
    rosterMap.get(prod).push({
      targetArtist: target,
      keywords: kws.split(',').map(k => k.trim().toLowerCase()).filter(Boolean),
    });
  }

  // 3. SONGSシート取得
  const soRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TARGET_SHEET}!A:J` });
  const allRows = soRes.data.values || [];
  const dataRows = allRows.slice(1);
  console.log(`\n${TARGET_SHEET}: ${dataRows.length} songs`);

  // 4. 仕分け
  const fixViaDetected = [];   // detectedArtistで解決
  const fixViaRoster  = [];   // Label_Rosterキーワードで解決
  const unresolved    = [];   // どちらでも解決できない

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const artist   = (r[1] || '').trim();
    const title    = (r[2] || '').trim();
    const detected = (r[7] || '').trim();

    if (!prodNames.has(artist)) continue; // プロダクション名でない → スキップ

    if (detected) {
      fixViaDetected.push({ rowIndex: i, artist, newArtist: detected, title });
      continue;
    }

    // Label_Rosterキーワードマッチ
    const candidates = rosterMap.get(artist) || [];
    const titleLower = title.toLowerCase();
    const matched = candidates.find(c => c.keywords.some(kw => titleLower.includes(kw)));
    if (matched) {
      fixViaRoster.push({ rowIndex: i, artist, newArtist: matched.targetArtist, title });
    } else {
      unresolved.push({ rowIndex: i, artist, title });
    }
  }

  // 5. レポート
  console.log(`\n--- 結果サマリ ---`);
  console.log(`  detectedArtistで修正: ${fixViaDetected.length} 曲`);
  console.log(`  Label_Rosterで修正 : ${fixViaRoster.length} 曲`);
  console.log(`  未解決             : ${unresolved.length} 曲`);

  if (fixViaRoster.length > 0) {
    console.log('\n--- Label_Rosterキーワードで解決 (サンプル10件) ---');
    fixViaRoster.slice(0, 10).forEach(r =>
      console.log(`  "${r.artist}" → "${r.newArtist}"  ${r.title}`)
    );
  }

  if (unresolved.length > 0) {
    console.log('\n--- 未解決（手動確認推奨） ---');
    unresolved.forEach(r =>
      console.log(`  Row${r.rowIndex + 2}: [${r.artist}] ${r.title}`)
    );
  }

  if (!DO_FIX) {
    console.log('\n[DRY RUN] 変更なし。--fix で実行。');
    return;
  }

  // 6. 修正実行
  const toUpdate = [...fixViaDetected, ...fixViaRoster];
  if (toUpdate.length === 0) {
    console.log('\n修正対象なし。');
    return;
  }

  console.log(`\n[FIX] ${toUpdate.length}曲のartistを修正中...`);

  // B列（artist）を更新。detectedArtistからコピーした場合はH列はそのまま。
  // Label_Rosterで解決した場合はH列（detectedArtist）も同時に設定。
  const updateData = toUpdate.map(f => ({
    range: `${TARGET_SHEET}!B${f.rowIndex + 2}`,
    values: [[f.newArtist]],
  }));

  // Label_Rosterで解決した分はdetectedArtistも埋める
  const detectedUpdates = fixViaRoster.map(f => ({
    range: `${TARGET_SHEET}!H${f.rowIndex + 2}`,
    values: [[f.newArtist]],
  }));

  const allUpdates = [...updateData, ...detectedUpdates];
  const BATCH = 500;
  for (let i = 0; i < allUpdates.length; i += BATCH) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: allUpdates.slice(i, i + BATCH),
      },
    });
    console.log(`  Updated ${Math.min(i + BATCH, allUpdates.length)}/${allUpdates.length}`);
  }

  console.log('\n[FIX] 完了');
  if (unresolved.length > 0) {
    console.log(`\n⚠ 未解決 ${unresolved.length}曲 は手動確認が必要です（Label_Rosterにキーワード未登録）。`);
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
