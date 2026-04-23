import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
  credentials
});

async function reset() {
  console.log('--- Resetting Clean Titles for re-processing ---');
  
  // Re-run for everything that was previously AI_CLEANED
  const query = `
    UPDATE \`heat_ranking.songs_master\`
    SET cleanTitle = '', classificationSource = 'AI'
    WHERE classificationSource = 'AI_CLEANED'
  `;
  
  try {
    const [job] = await bq.createQueryJob({ query });
    console.log(`Job ${job.id} started. Waiting for completion...`);
    await job.getQueryResults();
    console.log('Cleanup titles reset successfully.');
  } catch (e) {
    console.error('Reset failed:', e.message);
  }
}

reset().catch(console.error);
