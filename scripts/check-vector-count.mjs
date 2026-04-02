import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  credentials,
});

async function checkCount() {
  const query = 'SELECT count(DISTINCT videoId) as total_vectorized FROM `heat_ranking.songs_vector`';
  const [rows] = await bq.query({ query });
  console.log(`Total Vectorized: ${rows[0].total_vectorized}`);
}

checkCount().catch(console.error);
