import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID,
});

async function checkRefreshStatus() {
  const query = `
    SELECT 
      COUNT(*) as total_songs,
      COUNTIF(analyzedReason IS NOT NULL AND analyzedReason != '') as with_ai_metadata,
      COUNTIF(analyzedReason IS NULL OR analyzedReason = '') as missing_ai_metadata,
      -- Stale check (same logic as refresh-metadata-node.mjs)
      COUNTIF(
        (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) <= 7 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 1)
        OR
        (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) > 7 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) <= 60 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 7)
        OR
        (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) > 60 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 30)
      ) as stale_songs_needing_refresh
    FROM \`heat_ranking.songs_master\` s
    LEFT JOIN \`heat_ranking.songs_vector\` v ON s.videoId = v.videoId
  `;

  console.log("Running status query...");
  const [rows] = await bq.query(query);
  console.log("--- Metadata Status ---");
  console.table(rows);
}

checkRefreshStatus().catch(console.error);
