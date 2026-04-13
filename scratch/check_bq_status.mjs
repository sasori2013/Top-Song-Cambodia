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

async function checkStatus() {
  const [rows] = await bq.query("SELECT * FROM `heat_ranking.process_status` ORDER BY last_updated_at DESC");
  console.log(JSON.stringify(rows, null, 2));
}

checkStatus().catch(console.error);
