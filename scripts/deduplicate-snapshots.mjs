/**
 * Deduplicates the BigQuery snapshots table by keeping only the max views record
 * per (date, videoId) combination. Replaces the table in-place using a temp table.
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

async function deduplicate() {
  console.log('=== Deduplicating snapshots table ===');

  // First verify the problem
  const [before] = await bq.query(`
    SELECT SUM(cnt) as total, SUM(uniq) as unique_count, COUNT(*) as dates
    FROM (
      SELECT CAST(date AS STRING) as d, COUNT(*) as cnt, COUNT(DISTINCT videoId) as uniq 
      FROM ${DATASET_ID}.snapshots GROUP BY d
    )
  `);
  console.log('Before:', before[0]);

  // Overwrite the table with a deduplicated query
  const dedupeQuery = `
    SELECT date, videoId, 
      MAX(views) as views, 
      MAX(likes) as likes, 
      MAX(comments) as comments
    FROM \`${DATASET_ID}.snapshots\`
    GROUP BY date, videoId
  `;

  console.log('Running deduplication query (overwrite)...');
  const [job] = await bq.createQueryJob({
    query: dedupeQuery,
    destination: bq.dataset(DATASET_ID).table('snapshots'),
    writeDisposition: 'WRITE_TRUNCATE', // Overwrite the table
    createDisposition: 'CREATE_IF_NEEDED',
  });

  console.log('Job started:', job.id);
  await job.promise();
  console.log('Job completed!');

  // Verify after
  const [after] = await bq.query(`
    SELECT SUM(cnt) as total, SUM(uniq) as unique_count
    FROM (
      SELECT CAST(date AS STRING) as d, COUNT(*) as cnt, COUNT(DISTINCT videoId) as uniq 
      FROM ${DATASET_ID}.snapshots GROUP BY d
    )
  `);
  console.log('After:', after[0]);
  console.log('=== Deduplication Complete ===');
}

deduplicate().catch(console.error);
