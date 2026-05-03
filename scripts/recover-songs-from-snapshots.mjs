/**
 * recover-songs-from-snapshots.mjs
 *
 * BQ snapshots テーブルの履歴から SONGS シートを復元する。
 * sync-bq-to-sheets が SONGS を誤って上書きした場合のリカバリ用。
 *
 * 動作:
 *   1. BQ snapshots から直近60日以内に記録された videoId を取得
 *   2. songs_master から各曲のメタデータを取得
 *   3. songs_master.publishedAt が60日以内の曲のみ SONGS に書き込む
 *
 * Usage:
 *   node scripts/recover-songs-from-snapshots.mjs [--dry-run]
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials: cred });
const auth = new google.auth.GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function main() {
  console.log(`=== SONGS 復元 (${DRY_RUN ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. 直近60日にスナップショットが存在した videoId × songs_master を結合
  const [rows] = await bq.query(`
    SELECT
      m.videoId,
      TRIM(m.artist) AS artist,
      COALESCE(NULLIF(TRIM(m.cleanTitle), ''), NULLIF(TRIM(m.title), ''), m.videoId) AS displayTitle,
      COALESCE(NULLIF(TRIM(m.cleanTitle), ''), '') AS cleanTitle,
      FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', m.publishedAt) AS publishedAt,
      COALESCE(m.eventTag, '') AS eventTag,
      COALESCE(m.category, '') AS category,
      COALESCE(TRIM(m.detectedArtist), '') AS detectedArtist,
      COALESCE(TRIM(m.featuring), '') AS featuring
    FROM \`${DATASET_ID}.songs_master\` m
    INNER JOIN (
      SELECT DISTINCT videoId
      FROM \`${DATASET_ID}.snapshots\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
    ) s ON m.videoId = s.videoId
    WHERE m.publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
      AND m.publishedAt IS NOT NULL
      AND NOT REGEXP_CONTAINS(COALESCE(m.title, ''), r'[぀-ヿ一-鿿가-힯฀-๿]')
      AND NOT REGEXP_CONTAINS(COALESCE(m.artist, ''), r'[぀-ヿ一-鿿가-힯฀-๿]')
    QUALIFY ROW_NUMBER() OVER(PARTITION BY m.videoId ORDER BY m.publishedAt DESC) = 1
    ORDER BY m.publishedAt DESC
  `);

  console.log(`スナップショット履歴から取得: ${rows.length} 曲（publishedAt 60日以内）`);

  if (rows.length === 0) {
    console.error('\n⚠ 該当曲が0件です。');
    console.error('診断: BQ songs_master に publishedAt が60日以内の曲がないか、');
    console.error('      直近60日のスナップショットがありません。');
    console.error('\n別の方法として backfill が必要かもしれません。');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n最初の10件:');
    rows.slice(0, 10).forEach((r, i) =>
      console.log(`  [${i+1}] ${r.videoId} | ${r.artist} | ${r.displayTitle} | ${r.publishedAt}`)
    );
    console.log('\n[DRY RUN] 変更なし。--dry-run を外して実行してください。');
    return;
  }

  // 2. SONGS!A2:J を完全クリア
  console.log('\nSONGS!A2:J をクリア中...');
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:J' });

  // 3. データ書き込み
  const values = rows.map(r => [
    r.videoId, r.artist, r.displayTitle, r.cleanTitle,
    r.publishedAt, r.eventTag, r.category, r.detectedArtist,
    r.featuring, `https://www.youtube.com/watch?v=${r.videoId}`,
  ]);

  const CHUNK = 1000;
  for (let i = 0; i < values.length; i += CHUNK) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `SONGS!A${i + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: values.slice(i, i + CHUNK) },
    });
  }

  console.log(`✅ SONGS に ${rows.length} 曲を書き込みました。`);
}

main().catch(e => { console.error(e); process.exit(1); });
