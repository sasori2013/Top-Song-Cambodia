/**
 * highlight-production-rows.mjs
 *
 * SONGSシートでartistがプロダクション名または空の行にハイライトをつける。
 * - オレンジ: artistがプロダクション名
 * - 赤      : artistが空
 * - なし    : 正常（既存ハイライトをクリア）
 *
 * Usage:
 *   node scripts/highlight-production-rows.mjs
 *   node scripts/highlight-production-rows.mjs --clear   # ハイライト全消し
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_CLEAR = process.argv.includes('--clear');

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const COLOR_ORANGE = { red: 1.0, green: 0.76, blue: 0.4 };  // プロダクション名
const COLOR_RED    = { red: 0.96, green: 0.49, blue: 0.49 }; // 空/不明
const COLOR_NONE   = { red: 1.0, green: 1.0, blue: 1.0 };   // クリア（白）

function makeColorRequest(sheetGid, rowIndex, color) {
  return {
    repeatCell: {
      range: {
        sheetId: sheetGid,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: 0,
        endColumnIndex: 10,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: color,
        },
      },
      fields: 'userEnteredFormat.backgroundColor',
    },
  };
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth });

  // シートID取得
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === 'SONGS');
  if (!sheetMeta) throw new Error('SONGS sheet not found');
  const sheetGid = sheetMeta.properties.sheetId;

  // P型プロダクション名セット
  const arRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:F' });
  const prodNames = new Set(
    (arRes.data.values || [])
      .filter(r => ['P', 'Production', 'Label'].includes((r[5] || '').trim()))
      .map(r => (r[0] || '').trim())
      .filter(Boolean)
  );

  // SONGS取得
  const soRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A:J' });
  const dataRows = (soRes.data.values || []).slice(1);
  console.log(`SONGS: ${dataRows.length} rows`);

  const requests = [];

  if (DO_CLEAR) {
    // 全行クリア
    for (let i = 0; i < dataRows.length; i++) {
      requests.push(makeColorRequest(sheetGid, i + 1, COLOR_NONE));
    }
    console.log(`Clearing highlights on ${dataRows.length} rows...`);
  } else {
    let orange = 0, red = 0, clear = 0;
    for (let i = 0; i < dataRows.length; i++) {
      const artist = (dataRows[i][1] || '').trim();
      if (prodNames.has(artist)) {
        requests.push(makeColorRequest(sheetGid, i + 1, COLOR_ORANGE));
        orange++;
      } else if (!artist) {
        requests.push(makeColorRequest(sheetGid, i + 1, COLOR_RED));
        red++;
      } else {
        requests.push(makeColorRequest(sheetGid, i + 1, COLOR_NONE));
        clear++;
      }
    }
    console.log(`オレンジ（プロダクション名）: ${orange} 行`);
    console.log(`赤（空/不明）              : ${red} 行`);
    console.log(`正常（白）                 : ${clear} 行`);
  }

  // バッチ送信（500件ずつ）
  const BATCH = 500;
  for (let i = 0; i < requests.length; i += BATCH) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: requests.slice(i, i + BATCH) },
    });
    process.stdout.write(`  ${Math.min(i + BATCH, requests.length)}/${requests.length}\r`);
  }
  console.log('\n完了');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
