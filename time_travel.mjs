import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const projectId = (process.env.GCP_PROJECT_ID || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId, credentials });

async function restore() {
  const sql = `
    CREATE OR REPLACE TABLE \`heat_ranking.songs_master\` AS 
    -- We want to deduplicate too, but using QUALIFY ROW_NUMBER over publishedAt
    SELECT * FROM \`heat_ranking.songs_master\` 
    FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 20 MINUTE)
    QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY publishedAt DESC) = 1
  `;
  const [job] = await bq.createQueryJob({ query: sql });
  await job.getQueryResults();
  console.log('Restored and deduplicated using Time Travel!');
  const [rows] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\``);
  console.log('New row count:', rows[0].c);
}
restore().catch(console.error);
