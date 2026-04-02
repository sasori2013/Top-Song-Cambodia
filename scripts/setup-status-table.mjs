import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  credentials,
});

async function setup() {
  const datasetId = 'heat_ranking';
  const tableId = 'process_status';

  const schema = [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'name', type: 'STRING' },
    { name: 'progress', type: 'INTEGER' },
    { name: 'total', type: 'INTEGER' },
    { name: 'status', type: 'STRING' },
    { name: 'last_updated_at', type: 'TIMESTAMP' },
  ];

  try {
    const [table] = await bq.dataset(datasetId).createTable(tableId, { schema });
    console.log(`Table ${table.id} created.`);
  } catch (err) {
    if (err.code === 409) {
      console.log('Table already exists.');
    } else {
      throw err;
    }
  }
}

setup().catch(console.error);
