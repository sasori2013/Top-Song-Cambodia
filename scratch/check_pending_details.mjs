import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
});

async function checkPendingDetails() {
  const query = `
    SELECT 
      MIN(s.publishedAt) as oldest_publish_date,
      MAX(s.publishedAt) as newest_publish_date,
      COUNT(*) as count,
      COUNTIF(s.analyzedReason IS NOT NULL) as with_ai_insight
    FROM \`heat_ranking.songs_master\` AS s
    LEFT JOIN \`heat_ranking.songs_vector\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL AND s.description IS NOT NULL
  `;
  const [rows] = await bq.query(query);
  console.log("Pending Vectors Summary:");
  console.log(JSON.stringify(rows, null, 2));

  const querySample = `
    SELECT s.videoId, s.artist, s.title, s.publishedAt
    FROM \`heat_ranking.songs_master\` AS s
    LEFT JOIN \`heat_ranking.songs_vector\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL AND s.description IS NOT NULL
    ORDER BY s.publishedAt DESC
    LIMIT 5
  `;
  const [sampleRows] = await bq.query(querySample);
  console.log("\\nLatest 5 songs needing vectorization:");
  console.log(JSON.stringify(sampleRows, null, 2));
}

checkPendingDetails().catch(console.error);
