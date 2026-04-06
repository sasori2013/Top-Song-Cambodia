import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function updateSongsSchema() {
  console.log('Updating BigQuery songs_master schema for auto-labeling...');
  
  const datasetId = 'heat_ranking';
  const tableId = 'songs_master';

  const sql = `
    ALTER TABLE \`${datasetId}.${tableId}\`
    ADD COLUMN IF NOT EXISTS eventTag STRING,
    ADD COLUMN IF NOT EXISTS category STRING,
    ADD COLUMN IF NOT EXISTS classificationSource STRING
  `;

  try {
    const [job] = await bq.createQueryJob({ query: sql });
    await job.getQueryResults();
    console.log('Successfully added labeling columns to songs_master.');
  } catch (error) {
    console.error('Error updating songs_master schema:', error.message);
  }
}

updateSongsSchema().catch(console.error);
