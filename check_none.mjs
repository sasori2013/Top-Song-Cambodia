import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const projectId = (process.env.GCP_PROJECT_ID || '').trim().replace(/^['"]|['"]$/g, '');
const credentialsStr = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(credentialsStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId, credentials });

async function check() {
  const [rows] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\` WHERE category = 'Other'`);
  console.log('Category=Other count:', rows[0].c);
  const [rows2] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\` WHERE eventTag = 'None'`);
  console.log('EventTag=None count:', rows2[0].c);
}
check().catch(console.error);
