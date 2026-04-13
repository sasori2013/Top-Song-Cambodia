import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({
  projectId: PROJECT_ID,
  credentials,
});

async function checkPendingVectors() {
  const query = `
    SELECT COUNT(*) as count
    FROM \`heat_ranking.songs_master\` AS s
    LEFT JOIN \`heat_ranking.songs_vector\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL AND s.description IS NOT NULL
  `;
  const [rows] = await bq.query(query);
  console.log(`Pending vectors: ${rows[0].count}`);
}

checkPendingVectors().catch(console.error);
