import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_master';

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function cleanup() {
  console.log('--- Cleaning BigQuery songs_master ---');

  // 1. Delete specific non-music vid and noisy patterns
  const deleteQuery = `
    DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    WHERE videoId = '1HdnYouqayY'
       OR LOWER(title) LIKE '%stream %'
       OR LOWER(title) LIKE '% live stream%'
       OR LOWER(title) LIKE '% reaction%'
       OR LOWER(title) LIKE '% gaming%'
       OR LOWER(title) LIKE '% vlog%'
  `;
  
  await bq.query(deleteQuery);
  console.log('  Deleted noisy videos based on title patterns.');

  // 2. Deduplicate
  const dedupeQuery = `
    CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` AS
    SELECT * EXCEPT(row_num)
    FROM (
      SELECT *, ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY publishedAt DESC) as row_num
      FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    )
    WHERE row_num = 1
  `;
  
  await bq.query(dedupeQuery);
  console.log('  Deduplicated table.');
}

cleanup().catch(console.error);
