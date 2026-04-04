import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['\"]|['\"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['\"]|['\"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function cleanupDuplicates() {
  console.log('--- BigQuery Database Cleanup Started ---');

  const tables = [
    {
      name: 'snapshots',
      partitionBy: 'videoId, date',
      orderBy: 'views DESC'
    },
    {
      name: 'rank_history',
      partitionBy: 'videoId, date, type',
      orderBy: 'rank ASC'
    }
  ];

  for (const table of tables) {
    console.log(`Deduplicating ${table.name}...`);
    const sql = `
      CREATE OR REPLACE TABLE \`${DATASET_ID}.${table.name}\` AS
      SELECT * EXCEPT(row_num) FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY ${table.partitionBy} ORDER BY ${table.orderBy}) as row_num
        FROM \`${DATASET_ID}.${table.name}\`
      ) WHERE row_num = 1
    `;
    
    try {
      await bq.query(sql);
      console.log(`✅ Table ${table.name} deduplicated.`);
    } catch (e) {
      console.error(`❌ Error deduplicating ${table.name}:`, e.message);
    }
  }

  console.log('--- BigQuery Database Cleanup Completed ---');
}

cleanupDuplicates().catch(console.error);
