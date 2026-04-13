import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });

async function investigate() {
  console.log('=== 1. Total rows vs unique videoIds ===');
  const [q1] = await bq.query(`
    SELECT 
      COUNT(*) as total_rows,
      COUNT(DISTINCT videoId) as unique_video_ids
    FROM \`heat_ranking.songs_master\`
  `);
  console.table(q1);

  console.log('\n=== 2. ClassificationSource breakdown ===');
  const [q2] = await bq.query(`
    SELECT classificationSource, COUNT(*) as count
    FROM \`heat_ranking.songs_master\`
    GROUP BY classificationSource
    ORDER BY count DESC
  `);
  console.table(q2);

  console.log('\n=== 3. Songs added by date (top 10 busiest days) ===');
  const [q3] = await bq.query(`
    SELECT DATE(publishedAt) as publish_date, COUNT(*) as count
    FROM \`heat_ranking.songs_master\`
    GROUP BY publish_date
    ORDER BY count DESC
    LIMIT 10
  `);
  console.table(q3);

  console.log('\n=== 4. Count of songs per artist (top 20) ===');
  const [q4] = await bq.query(`
    SELECT artist, COUNT(*) as count
    FROM \`heat_ranking.songs_master\`
    GROUP BY artist
    ORDER BY count DESC
    LIMIT 20
  `);
  console.table(q4);

  console.log('\n=== 5. Songs where description IS NULL (potentially invalid) ===');
  const [q5] = await bq.query(`
    SELECT 
      COUNT(*) as total,
      COUNTIF(description IS NULL OR description = '') as no_description,
      COUNTIF(description IS NOT NULL AND description != '') as has_description
    FROM \`heat_ranking.songs_master\`
  `);
  console.table(q5);
}

investigate().catch(console.error);
