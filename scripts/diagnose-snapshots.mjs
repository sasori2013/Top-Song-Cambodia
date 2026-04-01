import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function diagnoseSnapshots() {
  console.log('--- BigQuery Snapshots Diagnosis ---');
  const [rows] = await bq.query(`
    SELECT 
      CAST(date AS STRING) as date_val, 
      COUNT(*) as count,
      MIN(views) as min_views,
      MAX(views) as max_views
    FROM heat_ranking.snapshots
    GROUP BY date_val
    ORDER BY date_val DESC
    LIMIT 10
  `);
  
  if (rows.length === 0) {
    console.log('Table is EMPTY.');
  } else {
    console.table(rows);
  }
}

diagnoseSnapshots().catch(console.error);
