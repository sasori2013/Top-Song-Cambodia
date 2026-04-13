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
    SELECT 
      COUNT(*) as total_songs,
      SUM(CASE WHEN topComments IS NOT NULL AND topComments != '' AND topComments != 'No comments available.' AND topComments != 'Error fetching' THEN 1 ELSE 0 END) as has_topComments
    FROM \`heat_ranking.songs_master\`
  `);
  console.log('Progress:', rows[0].has_topComments, '/', rows[0].total_songs);
}
check().catch(console.error);
