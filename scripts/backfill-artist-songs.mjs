import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
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

async function runBackfill() {
  console.log('--- Artist Song Backfill (History) Started ---');
  await sendTelegramNotification('📜 <b>全履歴アーカイブ取得 (backfill-songs)</b> を開始します...');

  // 1. Get Artists
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:H' });
  const artistRows = resArtists.data.values || [];
  const artistsRaw = artistRows.map((r, i) => ({
    name: r[0],
    channelId: r[2],
    rowIndex: i + 2
  })).filter(a => a.name && a.channelId);

  const startIndex = parseInt(process.env.START_INDEX) || 0;
  const artists = process.env.TEST_MODE ? artistsRaw.slice(0, 1) : artistsRaw.slice(startIndex);

  // 2. Get existing IDs
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:A' });
  const resSongsLong = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A2:A' });
  const existingIds = new Set([
     ...(resSongs.data.values || []).flat(),
     ...(resSongsLong.data.values || []).flat()
  ].map(id => String(id).trim()));

  console.log(`Processing ${artists.length} artists. Existing records: ${existingIds.size}`);

  let overallNewSongs = 0;

  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    console.log(`[${i+1}/${artists.length}] Backfilling ${artist.name}...`);
    await updateProcessStatus(`Archive: ${artist.name}`, i, artists.length);

    try {
      // Get Uploads Playlist ID
      const resChannel = await youtube.channels.list({
        part: ['contentDetails'],
        id: [artist.channelId]
      });
      const uploadsPlaylistId = resChannel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        console.warn(`  No uploads playlist for ${artist.name}`);
        continue;
      }

      let nextPageToken = null;
      let artistSongs = [];
      let pageCount = 0;

      do {
        const resItems = await youtube.playlistItems.list({
          part: ['contentDetails', 'snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken: nextPageToken
        });

        const items = resItems.data.items || [];
        const videoIds = items.map(it => it.contentDetails.videoId).filter(id => !existingIds.has(id));

        if (videoIds.length > 0) {
          // Get Details in chunks of 50
          for (let j = 0; j < videoIds.length; j += 50) {
            const chunk = videoIds.slice(j, j + 50);
            const resVids = await youtube.videos.list({
              part: ['snippet', 'contentDetails'],
              id: chunk
            });

            for (const v of (resVids.data.items || [])) {
              const title = v.snippet.title.toLowerCase();
              const duration = v.contentDetails.duration;
              const totalSec = parseDuration(duration);
              const publishedAt = v.snippet.publishedAt;

              if (totalSec <= 60) continue; // Skip shorts
              if (NG_WORDS.some(ng => title.includes(ng))) continue; // Skip NG

              artistSongs.push([v.id, artist.name, v.snippet.title, publishedAt]);
            }
          }
        }

        nextPageToken = resItems.data.nextPageToken;
        pageCount++;
        if (pageCount % 5 === 0) console.log(`  Fetched ${pageCount * 50} items... Found ${artistSongs.length} potential new songs.`);
      } while (nextPageToken);

      if (artistSongs.length > 0) {
        console.log(`  Adding ${artistSongs.length} songs for ${artist.name}...`);
        
        // Append to SONGS_LONG
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'SONGS_LONG!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: artistSongs }
        });

        // Insert to BigQuery
        const bqRows = artistSongs.map(r => ({
          videoId: r[0],
          artist: r[1],
          title: r[2],
          publishedAt: r[3]
        }));
        await bq.dataset(DATASET_ID).table(TABLE_SONGS).insert(bqRows);

        overallNewSongs += artistSongs.length;
        artistSongs.forEach(s => existingIds.add(s[0]));
      }

    } catch (err) {
      console.error(`  Error backfilling ${artist.name}:`, err.message);
    }
  }

  // Final Sort for SONGS_LONG (SheetId: 453469018)
  console.log('Sorting SONGS_LONG by publishedAt...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        sortRange: {
          range: { sheetId: 453469018, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
          sortSpecs: [{ dimensionIndex: 3, sortOrder: 'DESCENDING' }]
        }
      }]
    }
  });

  console.log(`--- Backfill Completed. Total Added: ${overallNewSongs} ---`);
  await updateProcessStatus('Archive: Completed', artists.length, artists.length, 'completed');
  await sendTelegramNotification(`✅ <b>全履歴アーカイブ取得完了</b>\n追加された楽曲: ${overallNewSongs}件\nBigQuery & SONGS_LONG 同期済み`);
}

function parseDuration(duration) {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1]) || 0) * 3600 + (parseInt(match[2]) || 0) * 60 + (parseInt(match[3]) || 0);
}

runBackfill().catch(async (error) => {
  console.error(error);
  await sendTelegramNotification(`⚠️ <b>バックフィルエラー</b>\n<code>${error.message}</code>`);
});
