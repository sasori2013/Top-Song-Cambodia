import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';

const NG_WORDS = [
  'teaser', 'trailer', 'preview', 'behind', 'making',
  'version', 'ver.', 'live', 'performance',
  'dance practice', 'karaoke', 'remix'
];

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials missing');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function runUpdateSongs() {
  console.log('--- Song Discovery (Node.js) Started ---');
  await sendTelegramNotification('🎵 <b>新曲探索 (updateSongs)</b> を開始します...');

  // 1. Get Artists from Sheet
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:H' });
  const artists = (resArtists.data.values || []).map(r => ({
    name: r[0],
    channelId: r[2],
    isDeepSearch: String(r[7]).toUpperCase() === 'TRUE'
  })).filter(a => a.name && a.channelId);
  console.log(`Processing ${artists.length} artists...`);

  // 2. Get existing video IDs from SONGS and SONGS_LONG
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:A' });
  const resSongsLong = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A2:A' });
  const existingIds = new Set([
      ...(resSongs.data.values || []).flat(),
      ...(resSongsLong.data.values || []).flat()
  ].map(id => String(id).trim()));

  const newSongsData = [];
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - 60);

  // 3. Process each artist (Chunking for quota/concurrency)
  for (const artist of artists) {
    try {
      console.log(`Checking ${artist.name}...`);
      let channelItems = [];

      if (artist.isDeepSearch) {
        // Search API (More expensive but catches everything)
        const resSearch = await youtube.search.list({
          part: ['snippet'],
          channelId: artist.channelId,
          maxResults: 15,
          order: 'date',
          type: ['video']
        });
        channelItems = (resSearch.data.items || []).map(it => ({
            id: it.id.videoId,
            title: it.snippet.title,
            publishedAt: it.snippet.publishedAt
        }));
      } else {
          // Playlist API (Cheaper)
          // First get Uploads Playlist ID
          const resChan = await youtube.channels.list({
            part: ['contentDetails'],
            id: [artist.channelId]
          });
          const uploadsId = resChan.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
          if (uploadsId) {
            const resPl = await youtube.playlistItems.list({
              part: ['snippet'],
              playlistId: uploadsId,
              maxResults: 15
            });
            channelItems = (resPl.data.items || []).map(it => ({
                id: it.snippet.resourceId.videoId,
                title: it.snippet.title,
                publishedAt: it.snippet.publishedAt
            }));
          }
      }

      // 4. Batch check durations and filter
      const videoIdsToCheck = channelItems.map(it => it.id).filter(id => !existingIds.has(id));
      if (videoIdsToCheck.length > 0) {
          const resVideo = await youtube.videos.list({
            part: ['contentDetails', 'snippet'],
            id: videoIdsToCheck
          });
          
          for (const vid of (resVideo.data.items || [])) {
              const duration = vid.contentDetails.duration; // ISO 8601
              const title = vid.snippet.title.toLowerCase();
              const publishedAt = new Date(vid.snippet.publishedAt);

              // Filters
              if (publishedAt < lookbackDate) continue;
              if (NG_WORDS.some(ng => title.includes(ng))) continue;
              
              // Duration Check (No Shorts < 61s)
              // PT1M5S -> 65s
              const totalSec = parseDuration(duration);
              if (totalSec <= 60) {
                  console.log(`  Skipped (Short): ${vid.snippet.title} (${totalSec}s)`);
                  continue;
              }

              newSongsData.push([
                vid.id,
                artist.name,
                vid.snippet.title,
                vid.snippet.publishedAt
              ]);
              console.log(`  NEW: ${vid.snippet.title}`);
          }
      }
    } catch (err) {
      console.error(`  Error checking ${artist.name}:`, err.message);
    }
  }

  // 5. Update Sheet and BQ
  if (newSongsData.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'SONGS!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newSongsData },
    });
    console.log(`Appended ${newSongsData.length} new songs to SONGS sheet.`);

    // Sync to BigQuery
    const bqRows = newSongsData.map(r => ({
      videoId: r[0],
      artist: r[1],
      title: r[2],
      publishedAt: r[3]
    }));
    await bq.dataset(DATASET_ID).table(TABLE_SONGS).insert(bqRows);
    console.log('Synced to BigQuery (songs_master).');
  } else {
    console.log('No new songs found.');
  }

  console.log('--- Song Discovery (Node.js) Completed ---');
  await sendTelegramNotification(`✅ <b>新曲探索完了</b>\n新たに追加された曲: ${newSongsData.length}件`);
}

function parseDuration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1]) || 0;
    const mins = parseInt(match[2]) || 0;
    const secs = parseInt(match[3]) || 0;
    return hours * 3600 + mins * 60 + secs;
}

runUpdateSongs().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>新曲探索エラー</b>\n<code>${error.message}</code>`);
});
