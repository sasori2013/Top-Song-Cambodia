import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const bq = new BigQuery({ 
  projectId: process.env.GCP_PROJECT_ID, 
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}') 
});

async function check() {
  const [rows] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\` WHERE eventTag = 'None' OR category = 'Other'`);
  console.log('Undefined/None count:', rows[0].c);
}
check();
