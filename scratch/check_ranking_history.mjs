import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({
  projectId: PROJECT_ID,
  credentials,
});

async function checkRanking() {
  const query = "SELECT date, COUNT(*) as count FROM `heat_ranking.rank_history` GROUP BY date ORDER BY date DESC LIMIT 5";
  const [rows] = await bq.query(query);
  console.log(JSON.stringify(rows, null, 2));
}

checkRanking().catch(console.error);
