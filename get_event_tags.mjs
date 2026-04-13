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

async function check() {
  const [rows] = await bq.query(`
    SELECT eventTag, COUNT(*) as count 
    FROM \`heat_ranking.songs_master\` 
    GROUP BY eventTag 
    ORDER BY count DESC
  `);
  console.log(JSON.stringify(rows, null, 2));
}
check().catch(console.error);
