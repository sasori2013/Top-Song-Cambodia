import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_HISTORY = 'rank_history';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function check() {
  const [rows] = await bq.query(`
    SELECT * 
    FROM \`${DATASET_ID}.${TABLE_HISTORY}\` 
    WHERE date >= '2026-04-08' AND type = 'DAILY' 
    ORDER BY date DESC, rank ASC 
    LIMIT 20
  `);
  console.log(JSON.stringify(rows, null, 2));
}

check().catch(console.error);
