/**
 * Deduplicates the BigQuery songs_master table by keeping only one record
 * per videoId. Replaces the table in-place using a temp table.
 */
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function deduplicateSongs() {
  console.log('=== Deduplicating songs_master table ===');

  const [before] = await bq.query(`SELECT COUNT(*) as total, COUNT(DISTINCT videoId) as uniq FROM ${DATASET_ID}.songs_master`);
  console.log('Before:', before[0]);

  const dedupeQuery = `
    SELECT videoId, MAX(artist) as artist, MAX(title) as title, MAX(publishedAt) as publishedAt
    FROM \`${DATASET_ID}.songs_master\`
    GROUP BY videoId
  `;

  console.log('Running deduplication query (overwrite)...');
  const [job] = await bq.createQueryJob({
    query: dedupeQuery,
    destination: bq.dataset(DATASET_ID).table('songs_master'),
    writeDisposition: 'WRITE_TRUNCATE',
    createDisposition: 'CREATE_IF_NEEDED',
  });

  console.log('Job started:', job.id);
  await job.promise();
  console.log('Job completed!');

  const [after] = await bq.query(`SELECT COUNT(*) as total, COUNT(DISTINCT videoId) as uniq FROM ${DATASET_ID}.songs_master`);
  console.log('After:', after[0]);
  console.log('=== Deduplication of songs_master Complete ===');
}

deduplicateSongs().catch(console.error);
