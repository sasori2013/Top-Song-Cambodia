import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus, clearProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const DATASET_ID = 'heat_ranking';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Required environment variables missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function runWeeklyMaintenance() {
  console.log('--- Weekly Maintenance Started ---');
  const today = new Date().toISOString().split('T')[0];

  // 1. Find songs that haven't been updated in the last 7 days
  // We check both songs_master.last_updated_at and the latest entry in snapshots
  const query = `
    WITH latest_snapshots AS (
      SELECT videoId, MAX(date) as last_snap_date
      FROM \`${DATASET_ID}.snapshots\`
      GROUP BY videoId
    )
    SELECT m.videoId, m.title, ls.last_snap_date
    FROM \`${DATASET_ID}.songs_master\` m
    LEFT JOIN latest_snapshots ls ON m.videoId = ls.videoId
    WHERE ls.last_snap_date IS NULL 
       OR ls.last_snap_date < DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    LIMIT 1000
  `;

  const [rows] = await bq.query(query);
  if (rows.length === 0) {
    console.log('No songs require maintenance at this time.');
    clearProcessStatus();
    return;
  }

  updateProcessStatus('Weekly Maintenance', 0, rows.length);
  console.log(`Found ${rows.length} songs requiring update.`);

  // 2. Fetch from YouTube in chunks of 50
  const videoIds = rows.map(r => r.videoId);
  const snapshotsToInsert = [];
  
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    console.log(`Fetching stats for chunk ${i / 50 + 1}...`);
    updateProcessStatus('Weekly Maintenance', i, rows.length);

    try {
      const res = await youtube.videos.list({
        part: ['statistics', 'snippet'],
        id: chunk,
      });

      const items = res.data.items || [];
      for (const item of items) {
        const st = item.statistics || {};
        const sn = item.snippet || {};

        // Prepare snapshot
        snapshotsToInsert.push({
          date: today,
          videoId: item.id,
          views: parseInt(st.viewCount) || 0,
          likes: parseInt(st.likeCount) || 0,
          comments: parseInt(st.commentCount) || 0,
        });

        // Update Master record (last_updated_at and potentially title if changed)
        const updateQuery = `
          UPDATE \`${DATASET_ID}.songs_master\`
          SET last_updated_at = CURRENT_TIMESTAMP(),
              title = @title,
              artist = @artist
          WHERE videoId = @videoId
        `;
        await bq.query({
          query: updateQuery,
          params: { 
            title: sn.title || '', 
            artist: sn.channelTitle || '', 
            videoId: item.id 
          }
        });
      }
    } catch (err) {
      console.error(`Error processing chunk: ${err.message}`);
    }
  }

  // 3. Insert Snapshots into BigQuery
  if (snapshotsToInsert.length > 0) {
    console.log(`Inserting ${snapshotsToInsert.length} snapshots into BigQuery...`);
    // Chunked insert to BQ if necessary, but 500 is usually fine for one call
    await bq.dataset(DATASET_ID).table('snapshots').insert(snapshotsToInsert);
    console.log('Snapshots inserted successfully.');
  }

  console.log('--- Weekly Maintenance Completed ---');
  updateProcessStatus('Weekly Maintenance', rows.length, rows.length, 'completed');
  await sendTelegramNotification(`🗓️ <b>週次メンテナンス完了</b>\n${rows.length} 曲の統計データとメタデータを更新しました。`);
  setTimeout(clearProcessStatus, 30000); // Clear after 30 seconds
}

runWeeklyMaintenance().catch(console.error);
