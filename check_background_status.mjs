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
      COUNT(*) AS total_songs,
      COUNTIF(category IS NOT NULL AND category != '') AS has_category,
      COUNTIF(eventTag IS NOT NULL AND eventTag != '') AS has_eventTag,
      COUNTIF(description IS NOT NULL AND description != '') AS has_description,
      COUNTIF(topComments IS NOT NULL AND topComments != '') AS has_topComments
    FROM \`heat_ranking.songs_master\`
  `);
  console.log('Background Processing Status in songs_master:', JSON.stringify(rows[0], null, 2));

  try {
    const [vectors] = await bq.query(`SELECT COUNT(*) as vectors_count FROM \`heat_ranking.song_vectors\``);
    console.log('song_vectors count:', vectors[0]);
  } catch (e) {
    console.log('song_vectors unavailable:', e.message);
  }
}
check().catch(console.error);
