import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_vector';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function initVectorTable() {
  console.log(`Checking table ${TABLE_ID} in ${DATASET_ID}...`);
  const dataset = bq.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);

  const [exists] = await table.exists();
  if (exists) {
    console.log(`Table ${TABLE_ID} already exists.`);
    return;
  }

  console.log(`Creating table ${TABLE_ID}...`);
  const schema = [
    { name: 'videoId', type: 'STRING', mode: 'REQUIRED' },
    { name: 'embedding', type: 'FLOAT64', mode: 'REPEATED' },
    { name: 'source_text', type: 'STRING' },
    { name: 'last_updated', type: 'TIMESTAMP' },
  ];

  await table.create({ schema });
  console.log(`Table ${TABLE_ID} created successfully.`);
}

initVectorTable().catch(console.error);
