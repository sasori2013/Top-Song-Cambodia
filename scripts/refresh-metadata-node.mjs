import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { classifySong } from './classify-song-node.mjs';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials missing.');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function runMetadataRefresh() {
  console.log('--- Smart Metadata Refresh Started ---');
  await sendTelegramNotification('🔄 <b>再ベクトル化選定 (refreshMetadata)</b> を開始します...');
  await updateProcessStatus('Refresh: Finding Stale Songs', 0, 100);

  // 1. Identify Stale Songs based on age tiers
  const query = `
    SELECT s.videoId, s.title, s.artist, s.description, s.publishedAt, v.last_updated
    FROM \`heat_ranking.songs_master\` s
    JOIN \`heat_ranking.songs_vector\` v ON s.videoId = v.videoId
    WHERE 
      -- Rule 1: New releases (< 7 days old) -> update if last_updated is older than 1 day
      (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) <= 7 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 1)
      OR
      -- Rule 2: Growing tracks (7 to 60 days old) -> update if last_updated is older than 7 days
      (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) > 7 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) <= 60 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 7)
      OR
      -- Rule 3: Legacy tracks (> 60 days old) -> update if last_updated is older than 30 days
      (TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.publishedAt, DAY) > 60 AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), v.last_updated, DAY) >= 30)
    ORDER BY v.last_updated ASC
    LIMIT 300
  `;
  
  const [rows] = await bq.query(query);

  if (rows.length === 0) {
    console.log('No stale songs found requiring refresh today.');
    await updateProcessStatus('Refresh: Completed', 100, 100, 'completed');
    return;
  }

  console.log(`Found ${rows.length} songs that need metadata refresh.`);
  await sendTelegramNotification(`⏳ <b>${rows.length}件</b> の楽曲のリフレッシュ処理を実施します。`);

  const BATCH_SIZE = 50;
  let successfulVideoIds = [];
  const results = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    console.log(`[Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(rows.length/BATCH_SIZE)}] Processing ${chunk.length} songs...`);
    await updateProcessStatus('Refresh: AI Categorization', i, rows.length);

    // Fetch latest descriptions
    const videoIds = chunk.map(s => s.videoId);
    let descriptionMap = {};
    try {
      const res = await youtube.videos.list({ part: ['snippet'], id: videoIds });
      (res.data.items || []).forEach(vid => {
        descriptionMap[vid.id] = vid.snippet?.description || '';
      });
    } catch (err) {
      console.warn("  ⚠️ Failed to fetch video snippets:", err.message);
    }

    for (const song of chunk) {
      const desc = descriptionMap[song.videoId] || song.description || '';
      try {
        const classification = await classifySong(song.videoId, song.title, desc);
        // Important: check if we actually got valid results
        if (classification.category && classification.topComments !== 'Error fetching') {
           results.push({ videoId: song.videoId, ...classification, desc });
           successfulVideoIds.push(song.videoId);
        }
      } catch (e) {
        console.warn(`  ⚠️ AI error for ${song.videoId}: ${e.message}`);
      }
      // Safety delay for rate limiting
      await new Promise(r => setTimeout(r, 200));
    }
  }

  if (results.length > 0) {
    console.log(`Saving ${results.length} updated metadata records...`);
    await updateProcessStatus('Refresh: Saving to Master', 90, 100);

    // 2. Update songs_master using MERGE
    const valuesSql = results.map((r, j) => 
      `SELECT @vId${j} as vId, @tag${j} as eTag, @cat${j} as cTag, @desc${j} as description, @comments${j} as topComments, @reason${j} as analyzedReason`
    ).join('\n      UNION ALL ');

    const params = {};
    results.forEach((r, j) => {
      params[`vId${j}`] = r.videoId;
      params[`tag${j}`] = r.eventTag || 'None';
      params[`cat${j}`] = r.category || 'Other';
      params[`desc${j}`] = r.desc || '';
      params[`comments${j}`] = r.topComments || '';
      params[`reason${j}`] = r.reason || '';
    });

    const mergeSql = `
      MERGE \`heat_ranking.songs_master\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          eventTag = IF(S.eTag = 'None' AND T.eventTag IS NOT NULL AND T.eventTag != 'None', T.eventTag, S.eTag),
          category = IF(S.cTag = 'Other' AND T.category IS NOT NULL AND T.category != 'Other', T.category, S.cTag),
          description = S.description,
          topComments = S.topComments,
          analyzedReason = S.analyzedReason,
          classificationSource = 'AI_REFRESH'
    `;

    try {
      await bq.query({ query: mergeSql, params });
      console.log('✅ Successfully updated songs_master');
    } catch (e) {
      console.error('❌ Failed to update songs_master:', e.message);
      throw e;
    }

    // 3. Delete stale vectors from songs_vector to force re-vectorization
    await updateProcessStatus('Refresh: Clearing Stale Vectors', 95, 100);
    const deleteSql = `
      DELETE FROM \`heat_ranking.songs_vector\`
      WHERE videoId IN UNNEST(@ids)
    `;
    try {
      await bq.query({
        query: deleteSql,
        params: { ids: successfulVideoIds }
      });
      console.log(`✅ Successfully deleted ${successfulVideoIds.length} stale vectors.`);
    } catch (e) {
      console.error('❌ Failed to clear stale vectors:', e.message);
      throw e;
    }
  }

  console.log('--- Smart Metadata Refresh Completed ---');
  await updateProcessStatus('Refresh: Completed', 100, 100, 'completed');
  await sendTelegramNotification(`✅ <b>リフレッシュ完了</b>\n${successfulVideoIds.length}件の楽曲のメタデータを更新し、再ベクトル化キューに登録しました。`);
}

runMetadataRefresh().catch(async (error) => {
  console.error('Fatal Error:', error);
  await sendTelegramNotification(`⚠️ <b>リフレッシュエラー</b>\n<code>${error.message}</code>`);
  process.exit(1);
});
