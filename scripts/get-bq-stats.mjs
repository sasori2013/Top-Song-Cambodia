import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function getStats() {
  const [rows] = await bq.query('SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT date) as days FROM `heat_ranking.rank_history`');
  console.log(JSON.stringify(rows[0]));
}

getStats().catch(console.error);
