/**
 * restore-songs-sheet.mjs
 *
 * BQ songs_master から publishedAt 60日以内の曲を SONGS シートに復元する。
 * GAS pruneSongs60d_ のスキーマ不一致バグで失われた曲を回復するための一回限りのスクリプト。
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
  // 1. Get current SONGS videoIds to avoid duplicates
  const resCurrentSongs = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SONGS!A2:A',
  });
  const existingIds = new Set(
    (resCurrentSongs.data.values || []).map(r => String(r[0] || '').trim()).filter(Boolean)
  );
  console.log(`Current SONGS sheet: ${existingIds.size} 行`);

  // 2. Also get SONGS_LONG videoIds to check if already there
  const resLong = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SONGS_LONG!A2:A',
  });
  const longIds = new Set(
    (resLong.data.values || []).map(r => String(r[0] || '').trim()).filter(Boolean)
  );
  console.log(`SONGS_LONG sheet: ${longIds.size} 行`);

  // 3. Fetch within-60d songs from BQ
  const [rows] = await bq.query(`
    SELECT
      videoId, artist,
      COALESCE(NULLIF(cleanTitle, ''), title) as title,
      '' as cleanTitle,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', publishedAt) as publishedAt,
      COALESCE(eventTag, 'None') as eventTag,
      COALESCE(category, 'Other') as category,
      COALESCE(detectedArtist, '') as detectedArtist,
      '' as featuring,
      CONCAT('https://www.youtube.com/watch?v=', videoId) as url
    FROM \`${DATASET_ID}.songs_master\`
    WHERE publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
      AND publishedAt IS NOT NULL
    ORDER BY publishedAt DESC
  `);

  console.log(`BQ: ${rows.length} 曲（60日以内）`);

  // 4. Filter out songs already in SONGS
  const toAdd = rows.filter(r => !existingIds.has(r.videoId));
  console.log(`追加対象: ${toAdd.length} 曲（SONGS未登録）`);

  if (toAdd.length === 0) {
    console.log('追加対象なし。終了します。');
    return;
  }

  // 5. Append to SONGS sheet (Node.js 10-column schema: A-J)
  const values = toAdd.map(r => [
    r.videoId,
    r.artist,
    r.title,
    r.cleanTitle,
    r.publishedAt,
    r.eventTag,
    r.category,
    r.detectedArtist,
    r.featuring,
    r.url,
  ]);

  // Batch in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'SONGS!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: chunk },
    });
    console.log(`  Appended ${i + chunk.length}/${values.length}...`);
  }

  console.log(`\n✅ 完了: ${toAdd.length} 曲を SONGS に復元しました。`);
  console.log('次に daily-snapshot-node.mjs を実行してBQスナップショットを更新してください。');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
