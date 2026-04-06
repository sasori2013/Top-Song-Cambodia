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

async function checkLabelStatus() {
  const query = `
    SELECT 
      COUNT(*) as total,
      COUNTIF(eventTag IS NULL) as unlabeled,
      COUNTIF(publishedAt >= '2026-03-01' AND eventTag IS NULL) as recent_unlabeled
    FROM \`heat_ranking.songs_master\`
  `;
  const [rows] = await bq.query(query);
  console.log('--- Labeling Status ---');
  console.log(`Total Songs: ${rows[0].total}`);
  console.log(`Unlabeled: ${rows[0].unlabeled}`);
  console.log(`Recent Unlabeled (Phnom Penh 2026-03-01+): ${rows[0].recent_unlabeled}`);
}

checkLabelStatus().catch(console.error);
