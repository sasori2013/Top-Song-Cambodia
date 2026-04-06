import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'snapshots';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function backfill(targetDate) {
  console.log(`--- Backfilling ${targetDate} ---`);
  
  const query = `
    WITH prev_day AS (
      SELECT videoId, views, likes, comments 
      FROM \`${DATASET_ID}.${TABLE_ID}\` 
      WHERE date = DATE_SUB(DATE '${targetDate}', INTERVAL 1 DAY)
    ),
    next_day AS (
      SELECT videoId, views, likes, comments 
      FROM \`${DATASET_ID}.${TABLE_ID}\` 
      WHERE date = DATE_ADD(DATE '${targetDate}', INTERVAL 1 DAY)
    )
    SELECT 
      p.videoId,
      CAST(ROUND((p.views + n.views) / 2) AS INT64) as views,
      CAST(ROUND((p.likes + n.likes) / 2) AS INT64) as likes,
      CAST(ROUND((p.comments + n.comments) / 2) AS INT64) as comments
    FROM prev_day p
    JOIN next_day n ON p.videoId = n.videoId
  `;

  const [rows] = await bq.query(query);
  if (rows.length === 0) {
    console.warn(`No data found for interpolation for ${targetDate}`);
    return 0;
  }

  const snapshotsRows = rows.map(r => ({
    date: targetDate,
    videoId: r.videoId,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    qualityScore: null,
    qualitySummary: 'Backfilled via interpolation'
  }));

  console.log(`Inserting ${snapshotsRows.length} rows for ${targetDate}...`);
  await bq.dataset(DATASET_ID).table(TABLE_ID).insert(snapshotsRows);
  return snapshotsRows.length;
}

async function run() {
  const missingDates = ['2026-03-19', '2026-03-28'];
  const results = [];

  for (const date of missingDates) {
    const count = await backfill(date);
    results.push({ date, count });
  }

  const summary = results.map(r => `• ${r.date}: ${r.count}件`).join('\n');
  await sendTelegramNotification(
    `🔄 <b>データ欠損の補完（バックフィル）完了</b>\n` +
    `前後のデータから線形補完を行い、修正しました。\n\n` +
    summary +
    `\n\nこれによりチャートの異常なスパイクと下落が解消されます。`
  );
  console.log('Backfill summary sent to Telegram.');
}

run().catch(console.error);
