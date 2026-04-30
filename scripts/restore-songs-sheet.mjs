/**
 * restore-songs-sheet.mjs
 *
 * BQ songs_master から SONGS シートを完全上書き復元する。
 * prune-by-duration-node.mjs の誤削除/列ズレ事故からのリカバリ用。
 *
 * 動作:
 *   1. SONGS!A2:J を完全クリア（ズレた余分列も含め消去）
 *   2. BQ songs_master から直近60日の曲を取得
 *   3. GAS互換の4列形式（videoId, artist, title, publishedAt）で書き直す
 *
 * Usage:
 *   node scripts/restore-songs-sheet.mjs
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials: cred });

async function main() {
  console.log('=== SONGS シート完全復元 ===');

  // 1. BQ songs_master から直近60日の曲を取得
  const [rows] = await bq.query(`
    SELECT
      videoId,
      COALESCE(NULLIF(TRIM(detectedArtist), ''), NULLIF(TRIM(artist), ''), 'Unknown') AS artist,
      COALESCE(NULLIF(TRIM(title), ''), videoId) AS title,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', publishedAt) AS publishedAt
    FROM \`${DATASET_ID}.songs_master\`
    WHERE publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
      AND publishedAt IS NOT NULL
    QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY publishedAt DESC) = 1
    ORDER BY publishedAt DESC
  `);

  console.log(`BQ から取得: ${rows.length} 曲（直近60日）`);

  if (rows.length === 0) {
    console.error('BQ にデータがありません。中断します。');
    process.exit(1);
  }

  // 2. 行データ構築: A=videoId, B=artist, C=HYPERLINK(title), D=publishedAt
  const values = rows.map(r => {
    const url = `https://www.youtube.com/watch?v=${r.videoId}`;
    const safeTitle = (r.title || '').replace(/"/g, '""');
    return [
      r.videoId,
      r.artist,
      `=HYPERLINK("${url}","${safeTitle}")`,
      r.publishedAt,
    ];
  });

  console.log('最初の3件:');
  values.slice(0, 3).forEach((r, i) =>
    console.log(`  [${i+1}] ${r[0]} | ${r[1]} | ${r[3]}`)
  );

  // 3. SONGS!A2:J を完全クリア（列ズレ解消のため広めにクリア）
  console.log('\nSONGS!A2:J をクリア中...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: 'SONGS!A2:J',
  });

  // 4. 4列で書き直し
  console.log('データ書き込み中...');
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `SONGS!A${i + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: chunk },
    });
    console.log(`  ${Math.min(i + CHUNK, values.length)} / ${values.length} 完了`);
  }

  console.log(`\n✅ 復元完了: ${values.length} 曲を SONGS シートに書き込みました`);
  console.log('ヘッダー行（行1）は変更していません。');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
