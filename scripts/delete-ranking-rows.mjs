/**
 * delete-ranking-rows.mjs
 *
 * RANKING_DAILY から特定の videoId を持つ行を削除する。
 * 同 videoId が SONGS / SONGS_LONG にあれば同時削除。
 *
 * Usage:
 *   node scripts/delete-ranking-rows.mjs <videoId1> [videoId2 ...]
 *   node scripts/delete-ranking-rows.mjs AuifemOMjGU 4i4zE9cubqk
 *   node scripts/delete-ranking-rows.mjs AuifemOMjGU 4i4zE9cubqk --write
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_WRITE = process.argv.includes('--write');
const TARGET_IDS = new Set(
  process.argv.slice(2).filter(a => !a.startsWith('--'))
);

if (TARGET_IDS.size === 0) {
  console.error('Usage: node delete-ranking-rows.mjs <videoId1> [videoId2 ...] [--write]');
  process.exit(1);
}

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

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

const SHEETS_TO_SCAN = [
  { name: 'RANKING_DAILY',   videoIdCol: 25 },
  { name: 'RANKING_WEEKLY',  videoIdCol: 22 },
  { name: 'RANKING_AI_TEST', videoIdCol: 25 },
  { name: 'SONGS',           videoIdCol: 0  },
  { name: 'SONGS_LONG',      videoIdCol: 0  },
];

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  console.log(`\n=== delete-ranking-rows (${DO_WRITE ? 'WRITE' : 'DRY RUN'}) ===`);
  console.log(`対象 videoId: ${[...TARGET_IDS].join(', ')}\n`);

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });

  for (const { name, videoIdCol } of SHEETS_TO_SCAN) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${name}!A2:${colLetter(videoIdCol)}`,
    });
    const rows = res.data.values || [];
    const toDelete = [];

    for (let i = 0; i < rows.length; i++) {
      const videoId = (rows[i][videoIdCol] || '').trim();
      if (TARGET_IDS.has(videoId)) {
        toDelete.push({ rowIndex: i + 1, sheetRow: i + 2, videoId });
      }
    }

    if (toDelete.length === 0) {
      console.log(`${name}: 該当なし`);
      continue;
    }

    toDelete.forEach(r => console.log(`  ${name} Row${r.sheetRow}: ${r.videoId}`));

    if (!DO_WRITE) continue;

    const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === name);
    if (!sheetMeta) { console.warn(`  Sheet "${name}" not found`); continue; }
    const sheetGid = sheetMeta.properties.sheetId;

    const deleteRequests = toDelete
      .map(r => r.rowIndex)
      .sort((a, b) => b - a)
      .map(i => ({
        deleteDimension: {
          range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
        },
      }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: deleteRequests },
    });
    console.log(`  → ${name}: ${toDelete.length}件 削除完了`);
  }

  if (!DO_WRITE) {
    console.log('\n[DRY RUN] --write で実行。');
  } else {
    console.log('\n完了');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
