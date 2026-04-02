import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_master';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function updateMasterSchema() {
  console.log(`Checking schema for ${TABLE_ID}...`);
  const dataset = bq.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);

  const [metadata] = await table.getMetadata();
  const schema = metadata.schema.fields;

  const hasUpdated = schema.find(f => f.name === 'last_updated_at');
  if (!hasUpdated) {
    console.log('Adding last_updated_at column...');
    schema.push({ name: 'last_updated_at', type: 'TIMESTAMP' });
    await table.setMetadata({ schema: { fields: schema } });
    console.log('Column added successfully.');
  } else {
    console.log('Column already exists.');
  }
}

updateMasterSchema().catch(console.error);
