/**
 * SONGS / SONGS_LONG シートに heat_id (K列) と isrc (L列) を追加し、
 * 既存の全行に HEAT ID をバックフィルする。
 *
 * 安全性:
 *  - 既存の A〜J 列には一切触れない
 *  - K1 が既に "heat_id" の場合はヘッダー書き込みをスキップ
 *  - A1 = "videoId" でなければ ABORT（シート構造の確認）
 *  - バッチサイズ 500行 で書き込み（タイムアウト対策）
 *
 * Run: node scripts/init-heat-id-columns.mjs
 */
import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');

const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const heatId = videoId => `KH-${crypto.createHash('sha256').update(String(videoId)).digest('hex').slice(0, 10)}`;

async function processSheet(sheetName) {
  console.log(`\n── ${sheetName} ──────────────────────────────────`);

  // 安全確認: A1 = "videoId" であること
  const { data: headerData } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1:L1`,
  });
  const headers = (headerData.values?.[0] || []);
  if (headers[0] !== 'videoId') {
    console.error(`  ABORT: ${sheetName}!A1 = "${headers[0]}" (expected "videoId")`);
    return;
  }

  const colK = headers[10] || '';
  const colL = headers[11] || '';

  // K1, L1 ヘッダー設定（未設定の場合のみ）
  if (colK !== 'heat_id' || colL !== 'isrc') {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          ...(colK !== 'heat_id' ? [{ range: `${sheetName}!K1`, values: [['heat_id']] }] : []),
          ...(colL !== 'isrc'    ? [{ range: `${sheetName}!L1`, values: [['isrc']]    }] : []),
        ],
      },
    });
    console.log(`  ヘッダー設定: K1=heat_id, L1=isrc`);
  } else {
    console.log(`  ヘッダー確認済み (K1=heat_id, L1=isrc)`);
  }

  // 全 videoId を取得
  const { data: videoData } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A2:A`,
  });
  const videoIds = (videoData.values || []).map(r => (r[0] || '').trim());
  console.log(`  videoId 取得: ${videoIds.length}件`);

  if (videoIds.length === 0) return;

  // 既存の K 列を確認（空でない行はスキップ）
  const { data: kData } = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!K2:K`,
  });
  const existingK = (kData.values || []).map(r => (r[0] || '').trim());

  // 書き込みが必要な行のみ更新（batchUpdate でまとめて送信）
  const BATCH = 500;
  let written = 0;
  const updates = [];

  for (let i = 0; i < videoIds.length; i++) {
    const vid = videoIds[i];
    if (!vid) continue;
    if (existingK[i] && existingK[i].startsWith('KH-')) continue; // 既にある

    updates.push({ row: i + 2, heat_id: heatId(vid) }); // +2 = 1-based + header
  }

  for (let start = 0; start < updates.length; start += BATCH) {
    const chunk = updates.slice(start, start + BATCH);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: chunk.map(u => ({
          range: `${sheetName}!K${u.row}`,
          values: [[u.heat_id]],
        })),
      },
    });
    written += chunk.length;
    process.stdout.write(`\r  書き込み: ${written}/${updates.length}件`);
  }

  console.log(`\n  完了: ${written}件 に heat_id を付与 (スキップ: ${videoIds.length - updates.length}件)`);
}

console.log('HEAT ID カラム初期化を開始します...');
await processSheet('SONGS');
await processSheet('SONGS_LONG');
console.log('\n✅ 完了');
