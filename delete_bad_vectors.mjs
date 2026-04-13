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
    SELECT count(*) as c 
    FROM \`heat_ranking.songs_vector\` 
    WHERE CAST(last_updated AS TIMESTAMP) > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
  `);
  console.log('Bad vectors written:', rows[0].c);

  if (rows[0].c > 0) {
    console.log('Deleting bad vectors...');
    await bq.query(`
      DELETE FROM \`heat_ranking.songs_vector\`
      WHERE CAST(last_updated AS TIMESTAMP) > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 MINUTE)
    `);
    console.log('Deleted.');
  }
}
check().catch(console.error);
