import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['\"]|['\"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';

// --- Settings ---
// YouTube API quota: commentThreads.list = 1 unit/call, videos.list = 1 unit/50 songs
// 5,000 songs/day = ~5,100 units (34% of 15,000 spare quota)
const DAILY_LIMIT = 5000;
const COMMENT_DELAY_MS = 300; // 0.3s between comment requests to avoid bursts

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

function isSpamOrBot(text) {
  if (!text || text.trim().length === 0) return true;
  const textWithoutEmojis = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
  if (textWithoutEmojis.length < 3) return true;
  if (/https?:\/\//.test(text)) return true;
  const lower = text.toLowerCase();
  const spamKeywords = ['subscribe', 'my channel', 'check out my', 'click my profile', 'link in bio'];
  if (spamKeywords.some(kw => lower.includes(kw))) return true;
  return false;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMetadataFetch() {
  console.log('--- Background Metadata Fetch Started ---');

  // 1. Count total remaining before we start
  const [countRows] = await bq.query(`
    SELECT COUNT(*) as remaining
    FROM \`${DATASET_ID}.${TABLE_SONGS}\`
    WHERE (description IS NULL OR description = '')
       OR (topComments IS NULL OR topComments = '')
  `);
  const totalRemaining = countRows[0].remaining;
  console.log(`Total songs needing metadata: ${totalRemaining}`);

  if (totalRemaining === 0) {
    console.log('✅ All songs already have complete metadata!');
    await sendTelegramNotification(`✅ <b>メタデータ補完完了</b>\n全楽曲のdescription + commentsが揃っています。`);
    return;
  }

  // 2. Fetch songs that need metadata (prioritize songs with no description over no comments)
  const [songs] = await bq.query(`
    SELECT videoId, title, artist, description, topComments
    FROM \`${DATASET_ID}.${TABLE_SONGS}\`
    WHERE (description IS NULL OR description = '')
       OR (topComments IS NULL OR topComments = '')
    ORDER BY 
      CASE WHEN (description IS NULL OR description = '') THEN 0 ELSE 1 END ASC,
      publishedAt DESC
    LIMIT ${DAILY_LIMIT}
  `);

  console.log(`Fetching metadata for ${songs.length} songs today...`);
  await sendTelegramNotification(
    `🔍 <b>メタデータ補完 開始</b>\n本日の対象: ${songs.length}件\n残り合計: ${totalRemaining}件`
  );

  // 3. Fetch descriptions in batches of 50 (1 unit per 50 songs)
  const descriptionMap = {};
  const videoIds = songs.map(s => s.videoId);

  console.log(`Fetching descriptions for ${videoIds.length} songs in batches of 50...`);
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    try {
      const res = await youtube.videos.list({ part: ['snippet'], id: chunk });
      for (const vid of (res.data.items || [])) {
        descriptionMap[vid.id] = vid.snippet?.description || '';
      }
    } catch (err) {
      console.warn(`  ⚠️ Description fetch failed for batch ${i/50 + 1}: ${err.message}`);
    }
    if (i + 50 < videoIds.length) await sleep(500);
  }
  console.log(`  Got descriptions for ${Object.keys(descriptionMap).length} songs.`);

  // 4. Fetch comments one by one (1 unit each)
  const commentsMap = {};
  let quotaHits = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];

    // Skip comment fetch if song already has valid comments
    if (song.topComments && song.topComments.length > 10) {
      commentsMap[song.videoId] = song.topComments;
      continue;
    }

    try {
      const res = await youtube.commentThreads.list({
        part: ['snippet'],
        videoId: song.videoId,
        maxResults: 100,
        order: 'relevance'
      });

      const validComments = [];
      for (const it of (res.data.items || [])) {
        const cText = it.snippet.topLevelComment.snippet.textOriginal;
        if (!isSpamOrBot(cText)) {
          validComments.push(cText.substring(0, 200)); // Cap each comment at 200 chars
          if (validComments.length >= 30) break;
        }
      }
      commentsMap[song.videoId] = validComments.length > 0 ? validComments.join('\n---\n') : 'No comments available.';
    } catch (err) {
      // Comments disabled (403) or video not found (404) — mark as empty string so it won't be retried
      if (err.code === 403 || (err.errors && err.errors[0]?.reason === 'commentsDisabled')) {
        commentsMap[song.videoId] = 'Comments disabled.';
      } else if (err.code === 404) {
        commentsMap[song.videoId] = 'Video not found.';
      } else {
        console.warn(`  ⚠️ Comment fetch failed for ${song.videoId}: ${err.message}`);
        commentsMap[song.videoId] = null; // Will retry next run
        quotaHits++;
      }
    }

    // Log progress every 500 songs
    if ((i + 1) % 500 === 0) {
      console.log(`  Progress: ${i + 1}/${songs.length} comments fetched...`);
    }

    await sleep(COMMENT_DELAY_MS);
  }

  console.log(`Comments fetched. Quota errors: ${quotaHits}`);

  // 5. Update BigQuery in batches using MERGE
  console.log('Updating BigQuery...');
  let updatedCount = 0;
  const MERGE_BATCH = 200; // Keep SQL manageable

  for (let i = 0; i < songs.length; i += MERGE_BATCH) {
    const chunk = songs.slice(i, i + MERGE_BATCH);

    const rowsToUpdate = chunk
      .map(song => ({
        videoId: song.videoId,
        description: descriptionMap[song.videoId] !== undefined ? descriptionMap[song.videoId] : (song.description || ''),
        topComments: commentsMap[song.videoId] !== undefined && commentsMap[song.videoId] !== null
          ? commentsMap[song.videoId]
          : (song.topComments || ''),
      }))
      .filter(r => r.description !== undefined || r.topComments !== undefined);

    if (rowsToUpdate.length === 0) continue;

    const valuesSql = rowsToUpdate.map((_, j) =>
      `SELECT @vId${i+j} as vId, @desc${i+j} as desc, @comments${i+j} as comments`
    ).join('\n      UNION ALL ');

    const params = {};
    rowsToUpdate.forEach((r, j) => {
      params[`vId${i+j}`] = r.videoId;
      params[`desc${i+j}`] = r.description;
      params[`comments${i+j}`] = r.topComments;
    });

    const mergeSql = `
      MERGE \`${DATASET_ID}.${TABLE_SONGS}\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          description = IF(S.desc != '' AND S.desc IS NOT NULL, S.desc, T.description),
          topComments = IF(S.comments != '' AND S.comments IS NOT NULL, S.comments, T.topComments)
    `;

    try {
      await bq.query({ query: mergeSql, params });
      updatedCount += rowsToUpdate.length;
      console.log(`  ✅ Updated ${updatedCount}/${songs.length} rows...`);
    } catch (e) {
      console.error(`  ❌ Merge failed for batch ${i/MERGE_BATCH + 1}: ${e.message}`);
    }
  }

  const remainingAfter = Math.max(0, totalRemaining - updatedCount);
  const daysLeft = remainingAfter > 0 ? Math.ceil(remainingAfter / DAILY_LIMIT) : 0;

  console.log('--- Background Metadata Fetch Completed ---');
  await sendTelegramNotification(
    `✅ <b>メタデータ補完 完了</b>\n` +
    `本日更新: ${updatedCount}件\n` +
    `残り: ${remainingAfter}件\n` +
    (daysLeft > 0 ? `📅 完了まで約 ${daysLeft} 日` : `🎉 全楽曲のメタデータ補完が完了しました！`)
  );
}

runMetadataFetch().catch(async (error) => {
  console.error('Fatal Error:', error);
  await sendTelegramNotification(`⚠️ <b>メタデータ補完エラー</b>\n<code>${error.message}</code>`);
  process.exit(1);
});
