import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });

async function check() {
  const sql = `
    SELECT videoId, rank as prevRank 
    FROM \`heat_ranking.rank_history\` 
    WHERE date = '2026-03-31' AND type = 'DAILY'
    LIMIT 5
  `;
  const [rows] = await bq.query(sql);
  console.log('Test history query for 2026-03-31:', rows);
  
  const sql2 = `
    SELECT videoId, rank as prevRank 
    FROM \`heat_ranking.rank_history\` 
    WHERE CAST(date AS STRING) LIKE '2026-03-31%' AND type = 'DAILY'
    LIMIT 5
  `;
  const [rows2] = await bq.query(sql2);
  console.log('Test history query with CAST LIKE:', rows2);
}
check().catch(console.error);
