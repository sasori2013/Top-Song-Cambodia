/**
 * sync-titles-to-ranking.mjs
 *
 * SONGS / SONGS_LONG の artist・cleanTitle を正解として
 * RANKING_DAILY / RANKING_WEEKLY / RANKING_AI_TEST の
 * D列（アーティスト）・E列（曲名）を videoId で照合し同期する。
 *
 * Usage:
 *   node scripts/sync-titles-to-ranking.mjs              # ドライラン
 *   node scripts/sync-titles-to-ranking.mjs --write      # 書き込み実行
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_WRITE = process.argv.includes('--write');

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const RANKING_SHEET_NAMES = ['RANKING_DAILY', 'RANKING_WEEKLY', 'RANKING_AI_TEST'];

// Resolve column indices from header row at runtime
async function resolveColumns(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!1:1`,
  });
  const headers = res.data.values?.[0] || [];
  const indexOf = (name) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Column "${name}" not found in ${sheetName} header row`);
    return i;
  };
  return {
    videoIdCol: indexOf('videoId'),
    artistCol:  indexOf('artist'),
    titleCol:   indexOf('title'),
  };
}

function colLetter(index) {
  // 0=A, 1=B, ... 25=Z, 26=AA ...
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== sync-titles-to-ranking (${DO_WRITE ? 'WRITE' : 'DRY RUN'}) ===\n`);

  // 1. Build source map: videoId → { artist, title }
  //    Priority: SONGS > SONGS_LONG, cleanTitle > title
  const sourceMap = new Map();

  for (const sheetName of ['SONGS_LONG', 'SONGS']) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A2:D`,
    });
    for (const r of (res.data.values || [])) {
      const videoId   = (r[0] || '').trim();
      const artist    = (r[1] || '').trim();
      const title     = (r[2] || '').trim();
      const cleanTitle = (r[3] || '').trim();
      if (!videoId) continue;
      sourceMap.set(videoId, {
        artist,
        title: cleanTitle || title,
      });
    }
    console.log(`${sheetName}: ${sourceMap.size}件 読み込み済み`);
  }

  // 2. Sync each RANKING sheet
  for (const name of RANKING_SHEET_NAMES) {
    const cols = await resolveColumns(sheets, name);
    const { videoIdCol, artistCol, titleCol } = cols;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${name}!A2:${colLetter(videoIdCol)}`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) { console.log(`\n${name}: データなし`); continue; }

    const updates = [];
    let matchCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const videoId = (r[videoIdCol] || '').trim();
      if (!videoId) continue;

      const src = sourceMap.get(videoId);
      if (!src) continue;

      const currentArtist = (r[artistCol] || '').trim();
      const currentTitle  = (r[titleCol]  || '').trim();
      const sheetRow = i + 2;

      const artistChanged = src.artist && src.artist !== currentArtist;
      const titleChanged  = src.title  && src.title  !== currentTitle;

      if (!artistChanged && !titleChanged) continue;

      matchCount++;
      if (matchCount <= 10) {
        if (artistChanged) console.log(`  ${name} Row${sheetRow} artist: "${currentArtist}" → "${src.artist}"`);
        if (titleChanged)  console.log(`  ${name} Row${sheetRow} title:  "${currentTitle}" → "${src.title}"`);
      }

      if (artistChanged) updates.push({ range: `${name}!${colLetter(artistCol)}${sheetRow}`, values: [[src.artist]] });
      if (titleChanged)  updates.push({ range: `${name}!${colLetter(titleCol)}${sheetRow}`,  values: [[src.title]]  });
    }

    if (matchCount > 10) console.log(`  ... 他 ${matchCount - 10}件`);
    console.log(`${name}: ${matchCount}件 更新対象`);

    if (!DO_WRITE || updates.length === 0) continue;

    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates.slice(i, i + BATCH) },
      });
    }
    console.log(`  → 書き込み完了`);
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
