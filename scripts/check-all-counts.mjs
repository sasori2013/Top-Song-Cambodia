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

async function checkCounts() {
  const q1 = 'SELECT count(DISTINCT videoId) as total FROM `heat_ranking.songs_vector`';
  const q2 = 'SELECT count(DISTINCT videoId) as total FROM `heat_ranking.songs_master`';
  
  const [vRows] = await bq.query({ query: q1 });
  const [mRows] = await bq.query({ query: q2 });
  
  console.log(`Vectorized Songs: ${vRows[0].total}`);
  console.log(`Songs in Master: ${mRows[0].total}`);
}

checkCounts().catch(console.error);
