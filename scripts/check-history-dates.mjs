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
  const [rows] = await bq.query(`
    SELECT FORMAT_DATE('%Y-%m-%d', date) as date_str, COUNT(*) as c
    FROM heat_ranking.rank_history
    WHERE type = 'DAILY' OR type = 'Daily'
    GROUP BY date_str
    ORDER BY date_str DESC
    LIMIT 10
  `);
  console.log('rank_history dates in BQ:', rows);
}
check().catch(console.error);
