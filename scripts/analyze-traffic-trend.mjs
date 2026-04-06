import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function analyze() {
  console.log('--- Weekly Traffic Trend Analysis ---');

  const query = `
    WITH daily_stats AS (
      SELECT 
        date,
        videoId,
        views,
        LAG(views) OVER(PARTITION BY videoId ORDER BY date) as prev_views
      FROM \`${DATASET_ID}.snapshots\`
    ),
    daily_increase AS (
      SELECT 
        date,
        SUM(CASE WHEN views > prev_views THEN views - prev_views ELSE 0 END) as total_dv,
        COUNT(DISTINCT videoId) as song_count
      FROM daily_stats
      WHERE prev_views IS NOT NULL
      GROUP BY date
    ),
    weekly_stats AS (
      SELECT 
        DATE_TRUNC(date, WEEK) as week_start,
        SUM(total_dv) as weekly_volume,
        AVG(song_count) as avg_songs_per_day
      FROM daily_increase
      GROUP BY week_start
      ORDER BY week_start DESC
    )
    SELECT * FROM weekly_stats LIMIT 8
  `;

  const [rows] = await bq.query(query);
  console.table(rows.map(r => ({
    week: r.week_start.value,
    volume: Math.round(r.weekly_volume).toLocaleString(),
    avg_songs: Math.round(r.avg_songs_per_day)
  })));

  // Also check for missing dates
  const [missingRows] = await bq.query(`
    SELECT date, COUNT(*) as c
    FROM \`${DATASET_ID}.snapshots\`
    WHERE date > DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY date
    ORDER BY date DESC
  `);
  console.log('\n--- Daily Snapshot Counts (Last 30 Days) ---');
  console.table(missingRows.map(r => ({ date: r.date.value, count: r.c })));
}

analyze().catch(console.error);
