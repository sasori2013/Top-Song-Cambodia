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

async function updateSchema() {
  console.log('Updating BigQuery artists_master schema...');
  
  const datasetId = 'heat_ranking';
  const tableId = 'artists_master';

  const sql = `
    ALTER TABLE \`${datasetId}.${tableId}\`
    ADD COLUMN IF NOT EXISTS channelId STRING,
    ADD COLUMN IF NOT EXISTS subscribers INT64,
    ADD COLUMN IF NOT EXISTS facebook STRING,
    ADD COLUMN IF NOT EXISTS productionName STRING,
    ADD COLUMN IF NOT EXISTS bio STRING,
    ADD COLUMN IF NOT EXISTS genres STRING,
    ADD COLUMN IF NOT EXISTS links STRING,
    ADD COLUMN IF NOT EXISTS artistInfo STRING,
    ADD COLUMN IF NOT EXISTS lastSync STRING,
    ADD COLUMN IF NOT EXISTS lastUpdated TIMESTAMP
  `;

  try {
    const [job] = await bq.createQueryJob({ query: sql });
    await job.getQueryResults();
    console.log('Successfully updated BigQuery schema for artists_master.');
  } catch (error) {
    console.error('Error updating BigQuery schema:', error.message);
  }
}

updateSchema().catch(console.error);
