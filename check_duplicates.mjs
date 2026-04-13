import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const projectId = (process.env.GCP_PROJECT_ID || '').trim().replace(/^['"]|['"]$/g, '');
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId, credentials });

async function check() {
  const [rows] = await bq.query(`
    SELECT videoId, count(*) as c 
    FROM \`heat_ranking.songs_master\` 
    GROUP BY videoId 
    HAVING c > 1
  `);
  console.log('Duplicates in songs_master:', rows);
}
check().catch(console.error);
