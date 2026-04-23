/**
 * cleanup-ng-songs.mjs
 *
 * NG_Keywordsシートのキーワードに一致する曲をSONGSシートから削除する。
 * キーワードはNG_Keywordsシートで手動追加・管理できる。
 *
 * Usage:
 *   node scripts/cleanup-ng-songs.mjs              # ドライラン（一致曲を表示）
 *   node scripts/cleanup-ng-songs.mjs --delete      # SONGSから削除実行
 *   node scripts/cleanup-ng-songs.mjs --sheet=SONGS_LONG --delete
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_DELETE   = process.argv.includes('--delete');
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

export async function loadNgKeywords(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'NG_Keywords!A2:A', // Skip header
  });
  return (res.data.values || [])
    .map(r => (r[0] || '').trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== cleanup-ng-songs (${DO_DELETE ? 'DELETE' : 'DRY RUN'}) | Sheet: ${TARGET_SHEET} ===\n`);

  // 1. Load NG keywords from sheet
  const ngKeywords = await loadNgKeywords(sheets, SHEET_ID);
  console.log(`NGキーワード (${ngKeywords.length}件): ${ngKeywords.join(', ')}\n`);

  // 2. Load target sheet
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TARGET_SHEET}!A:C`,
  });
  const rows = (res.data.values || []).slice(1);

  // 3. Find matching rows
  const toDelete = [];
  for (let i = 0; i < rows.length; i++) {
    const title = (rows[i][2] || '').toLowerCase();
    const matched = ngKeywords.find(kw => title.includes(kw));
    if (matched) {
      toDelete.push({
        rowIndex: i + 1, // 0-based data index (header=0, row1=1)
        sheetRow: i + 2, // 1-based sheet row
        artist: rows[i][1] || '',
        title: rows[i][2] || '',
        matchedKeyword: matched,
      });
    }
  }

  // 4. Report
  console.log(`--- 削除対象 (${toDelete.length}件) ---`);
  toDelete.forEach(r =>
    console.log(`  Row${r.sheetRow} [${r.matchedKeyword}] [${r.artist}] ${r.title}`)
  );

  if (!DO_DELETE) {
    console.log(`\n[DRY RUN] 変更なし。--delete で削除実行。`);
    return;
  }

  if (toDelete.length === 0) {
    console.log('\n削除対象なし。');
    return;
  }

  // 5. Get sheet GID for row deletion
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === TARGET_SHEET);
  if (!sheetMeta) throw new Error(`Sheet "${TARGET_SHEET}" not found`);
  const sheetGid = sheetMeta.properties.sheetId;

  // 6. Delete rows (bottom to top to avoid index shift)
  console.log(`\n[DELETE] ${toDelete.length}件を削除中...`);
  const deleteRequests = toDelete
    .map(r => r.rowIndex)
    .sort((a, b) => b - a)
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

  console.log(`[DELETE] ${toDelete.length}件 削除完了`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
