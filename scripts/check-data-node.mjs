import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function checkData() {
  console.log('--- BigQuery Data Diagnostic ---');

  // 1. Check snapshots dates
  const [dateRows] = await bq.query(`SELECT date, count(*) as count FROM \`${DATASET_ID}.snapshots\` GROUP BY date ORDER BY date DESC LIMIT 5`);
  console.log('Available Snapshot Dates:');
  console.table(dateRows.map(r => ({ date: r.date.value || r.date, count: r.count })));

  if (dateRows.length < 2) return;
  const latest = dateRows[0].date.value || dateRows[0].date;
  const prev = dateRows[1].date.value || dateRows[1].date;

  // 2. Sample comparison (Top 5 from latest)
  const sql = `
    SELECT 
      l.videoId,
      l.views as L_views,
      b.views as B_views,
      (l.views - COALESCE(b.views, 0)) as diff
    FROM \`${DATASET_ID}.snapshots\` l
    LEFT JOIN \`${DATASET_ID}.snapshots\` b ON l.videoId = b.videoId AND b.date = '${prev}'
    WHERE l.date = '${latest}'
    ORDER BY diff DESC
    LIMIT 10
  `;
  const [rows] = await bq.query(sql);
  console.log(`\nComparison: ${latest} vs ${prev}`);
  console.table(rows.map(r => ({
      videoId: r.videoId,
      Latest: r.L_views,
      Base: r.B_views,
      Increase: r.diff
  })));

  console.log('--- Diagnostic Completed ---');
}

checkData().catch(console.error);
