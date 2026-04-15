import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';
import { classifySong } from './classify-song-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const TEST_MODE = process.env.TEST_MODE === 'true';
const TEST_LIMIT_ARTISTS = parseInt(process.env.TEST_LIMIT || '0');
const ARTISTS_SHEET_ID = 0; // Found via API

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';

const MAX_DAILY_QUOTA = 35000; // Leave 15,000 for daily snapshots/ranking
let currentQuotaUsage = 0;

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
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY, timeout: 15000 });

async function runUpdateSongs() {
  console.log('--- Song Discovery (Node.js) Started ---');
  await sendTelegramNotification('🎵 <b>新曲探索 (updateSongs)</b> を開始します...');
  await updateProcessStatus('Discovery: Fetching Artists', 0, 100);

  // 1. Get Artists from Sheet (A: Name, ..., F: Prod, G: LastSync, ..., M: Type)
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:M' });
  const artistRows = resArtists.data.values || [];
  const knownArtistNames = new Set(artistRows.map(r => String(r[0]).trim()).filter(Boolean));
  const processedChannelIds = new Set();
  const newlyRegisteredArtists = [];

  const artists = artistRows.map((r, i) => ({
    name: r[0],
    channelId: r[2],
    subscribers: r[3],
    facebook: r[4],
    lastSync: r[6], // Column G
    type: r[12] || 'Artist', // Column M (0-indexed 12)
    rowIndex: i + 2 // 1-based index including header
  })).filter(a => a.name && a.channelId);
  
  const targetArtist = process.env.TARGET_ARTIST;
  const artistsToProcess = targetArtist 
    ? artists.filter(a => a.name === targetArtist)
    : (TEST_MODE && TEST_LIMIT_ARTISTS > 0 ? artists.slice(0, TEST_LIMIT_ARTISTS) : artists);

  console.log(`Processing ${artistsToProcess.length} artists. (Known: ${knownArtistNames.size})`);
  await updateProcessStatus('Discovery: Checking Artists', 0, artistsToProcess.length);

  // 2. Get existing video IDs from SONGS and SONGS_LONG
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:A' });
  const resSongsLong = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A2:A' });
  const existingIds = new Set([
      ...(resSongs.data.values || []).flat(),
      ...(resSongsLong.data.values || []).flat()
  ].map(id => String(id).trim()));

  const newSongsData = [];
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - 90); // Extended lookback to 90 days

  let successCount = 0;
  const failedArtists = [];
  const lastSyncUpdates = []; // { row, value }

  // 3. Process each artist (Chunking for quota/concurrency)
  for (const artist of artistsToProcess) {
    try {
      if (currentQuotaUsage >= MAX_DAILY_QUOTA) {
        console.warn(`🛑 Quota Limit Reached (${currentQuotaUsage}). Stopping discovery to save for daily updates.`);
        await sendTelegramNotification(
          `🛑 <b>クォータ制限警告</b>\n` +
          `新曲探索中にYouTube APIのクォータ上限(${MAX_DAILY_QUOTA})に達しました。\n` +
          `本日のこれ以上の探索は停止し、デイリー集計用の枠を確保します。`
        );
        break;
      }

      const isNewArtist = !artist.lastSync;
      console.log(`Checking ${artist.name} (${isNewArtist ? 'Full History Mode' : 'Search Mode'})...`);
      let channelItems = [];

      if (isNewArtist) {
        // Get Uploads Playlist ID
        const resChannel = await youtube.channels.list({
          part: ['contentDetails'],
          id: [artist.channelId]
        });
        currentQuotaUsage += 1; // channels.list
        const uploadsPlaylistId = resChannel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        
        if (uploadsPlaylistId) {
          let nextPageToken = null;
          do {
            const resItems = await youtube.playlistItems.list({
              part: ['contentDetails', 'snippet'],
              playlistId: uploadsPlaylistId,
              maxResults: 50,
              pageToken: nextPageToken
            });
            currentQuotaUsage += 1; // playlistItems.list
            const items = (resItems.data.items || []).map(it => ({
              id: it.contentDetails.videoId,
              title: it.snippet.title,
              publishedAt: it.snippet.publishedAt
            }));
            channelItems.push(...items);
            nextPageToken = resItems.data.nextPageToken;
          } while (nextPageToken);
        }
      } else {
        // 1. Official Channel Search (Comprehensive)
        const resSearch = await youtube.search.list({
          part: ['snippet'],
          channelId: artist.channelId,
          maxResults: 50,
          order: 'date',
          type: ['video']
        });
        currentQuotaUsage += 100; // search.list (Heavy!)
        
        const items = (resSearch.data.items || []).map(it => ({
            id: it.id.videoId,
            title: it.snippet.title,
            publishedAt: it.snippet.publishedAt
        }));
        channelItems.push(...items);

        // 2. Keyword Search (To catch MVs on Label channels etc.) - Uses 100 units
        console.log(`  Keyword searching for ${artist.name}...`);
        const resKeyword = await youtube.search.list({
          part: ['snippet'],
          q: `${artist.name} MV`,
          maxResults: 25,
          order: 'relevance', // Relevance is better for keyword search
          type: ['video']
        });
        currentQuotaUsage += 100; // search.list
        
        const kwItems = (resKeyword.data.items || []).map(it => ({
            id: it.id.videoId,
            title: it.snippet.title,
            publishedAt: it.snippet.publishedAt
        }));
        channelItems.push(...kwItems);
      }

      // --- Deduplication & Skip Logic ---
      if (processedChannelIds.has(artist.channelId)) {
        console.log(`  ⏭️ Channel ${artist.channelId} already processed in this run. Skipping discovery.`);
        successCount++;
        // Still update lastSync for this row
        const khrDate = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
        lastSyncUpdates.push({ range: `Artists!G${artist.rowIndex}`, values: [[khrDate]] });
        continue;
      }
      processedChannelIds.add(artist.channelId);

      // Deduplicate by ID
      const uniqueItemsMap = new Map();
      channelItems.forEach(item => {
        if (item.id) uniqueItemsMap.set(item.id, item);
      });
      channelItems = Array.from(uniqueItemsMap.values());

      // 4. Batch check durations and filter
      const videoIdsToCheck = channelItems.map(it => it.id).filter(id => !existingIds.has(id));
      if (videoIdsToCheck.length > 0) {
          // Process in chunks of 50 for videos.list
          for (let j = 0; j < videoIdsToCheck.length; j += 50) {
            const chunk = videoIdsToCheck.slice(j, j + 50);
            const resVideo = await youtube.videos.list({
              part: ['contentDetails', 'snippet'],
              id: chunk
            });
            currentQuotaUsage += 1; // videos.list
            
            for (const vid of (resVideo.data.items || [])) {
                const duration = vid.contentDetails.duration; // ISO 8601
                const title = vid.snippet.title.toLowerCase();
                const publishedAt = new Date(vid.snippet.publishedAt);

                // Filters
                if (!isNewArtist && publishedAt < lookbackDate) {
                    // console.log(`  Skipped (Old): ${vid.snippet.title}`);
                    continue;
                }
                if (NG_WORDS.some(ng => title.includes(ng))) {
                    console.log(`  Skipped (NG Word): ${vid.snippet.title}`);
                    continue;
                }
                
                const totalSec = parseDuration(duration);
                if (totalSec <= 60) {
                    console.log(`  Skipped (Short): ${vid.snippet.title} (${totalSec}s)`);
                    continue;
                }

                // Extra check for Keyword search: Title must contain artist name or be from their channel
                const isFromChannel = vid.snippet.channelId === artist.channelId;
                const containsName = vid.snippet.title.toLowerCase().includes(artist.name.toLowerCase());
                
                if (!isFromChannel && !containsName) {
                  console.log(`  Skipped (Not matching artist): ${vid.snippet.title}`);
                  continue;
                }

                const splitDate = new Date();
                splitDate.setDate(splitDate.getDate() - 60);
                const isRecent = publishedAt >= splitDate;

                // 4.1 AI Classification (Labels: eventTag, category, detectedArtist)
                const isLabel = artist.type === 'Label';
                const classification = await classifySong(vid.id, vid.snippet.title, vid.snippet.description, isLabel);

                newSongsData.push({
                  videoId: vid.id,
                  artist: artist.name,
                  title: vid.snippet.title,
                  publishedAt: vid.snippet.publishedAt,
                  eventTag: classification.eventTag || 'None',
                  category: classification.category || 'Other',
                  detectedArtist: classification.detectedArtist || '',
                  analyzedReason: classification.reason || '',
                  description: vid.snippet.description || '',
                  topComments: classification.topComments || '',
                  classificationSource: 'AI',
                  isRecent
                });
                console.log(`  NEW (${isRecent ? 'Recent' : 'Old'}): ${vid.snippet.title}`);

                // --- Auto-Register New Artist if detected ---
                if (isLabel && classification.detectedArtist) {
                  const dName = String(classification.detectedArtist).trim();
                  if (dName && dName !== 'Various Artists' && !knownArtistNames.has(dName)) {
                    console.log(`✨ New artist detected: ${dName}. Registering...`);
                    const newRowIndex = artistRows.length + 2 + newlyRegisteredArtists.length; 
                    // This is approximate but we'll use append which is safer. 
                    // To color, we need the actual row index.
                    
                    try {
                      const appendRes = await sheets.spreadsheets.values.append({
                        spreadsheetId: SHEET_ID,
                        range: 'Artists!A:M',
                        valueInputOption: 'USER_ENTERED',
                        requestBody: {
                          values: [[
                            dName, 
                            `https://www.youtube.com/channel/${artist.channelId}`, 
                            artist.channelId, 
                            artist.subscribers || '', 
                            artist.facebook || '', 
                            '', // prod flag empty
                            '', // last sync empty
                            'FALSE', // deep search
                            '', '', '', '', // bio, genres, links, info
                            'Artist' // Type M
                          ]]
                        }
                      });

                      const updatedRange = appendRes.data.updates.updatedRange;
                      const rowMatch = updatedRange.match(/(\d+)/);
                      const actualRowIndex = rowMatch ? parseInt(rowMatch[0]) : null;

                      if (actualRowIndex) {
                        // Apply background color to the new row
                        await sheets.spreadsheets.batchUpdate({
                          spreadsheetId: SHEET_ID,
                          requestBody: {
                            requests: [{
                              repeatCell: {
                                range: {
                                  sheetId: ARTISTS_SHEET_ID,
                                  startRowIndex: actualRowIndex - 1,
                                  endRowIndex: actualRowIndex,
                                  startColumnIndex: 0,
                                  endColumnIndex: 13
                                },
                                cell: {
                                  userEnteredFormat: {
                                    backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 } // Light green
                                  }
                                },
                                fields: 'userEnteredFormat.backgroundColor'
                              }
                            }]
                          }
                        });
                      }

                      knownArtistNames.add(dName);
                      newlyRegisteredArtists.push(dName);
                    } catch (regErr) {
                      console.error(`  Failed to register ${dName}:`, regErr.message);
                    }
                  }
                }
            }
          }
      }
      
      successCount++;
      const khrDate = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());
      lastSyncUpdates.push({
        range: `Artists!G${artist.rowIndex}`,
        values: [[khrDate]] // YYYY-MM-DD in KHR
      });

      await updateProcessStatus('Discovery: Checking Artists', artists.indexOf(artist) + 1, artists.length);
    } catch (err) {
      console.error(`  Error checking ${artist.name}:`, err.message);
      failedArtists.push(`${artist.name} (${err.message})`);
    }
  }

  // 5. Bulk Update lastSync in Artists sheet
  if (lastSyncUpdates.length > 0) {
    console.log(`Updating lastSync for ${lastSyncUpdates.length} artists...`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: lastSyncUpdates
      }
    });
  }

  // 6. Update Sheets and BQ
  if (newSongsData.length > 0) {
    const recentSongs = newSongsData.filter(s => s.isRecent).map(s => [
      s.videoId, s.artist, s.title, s.publishedAt, s.eventTag, s.category, s.detectedArtist
    ]);
    const oldSongs = newSongsData.filter(s => !s.isRecent).map(s => [
      s.videoId, s.artist, s.title, s.publishedAt, s.eventTag, s.category, s.detectedArtist
    ]);

    if (recentSongs.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'SONGS!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: recentSongs },
      });
      console.log(`Appended ${recentSongs.length} recent songs to SONGS sheet.`);

      // 7. Sort SONGS Sheet by publishedAt (Column D) Descending
      const SONGS_SHEET_ID = 2074157543;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              sortRange: {
                range: {
                  sheetId: SONGS_SHEET_ID,
                  startRowIndex: 1, // Skip header
                  startColumnIndex: 0,
                  endColumnIndex: 4
                },
                sortSpecs: [
                  {
                    dimensionIndex: 3, // Column D (0-based)
                    sortOrder: 'DESCENDING'
                  }
                ]
              }
            }
          ]
        }
      });
      console.log('Sorted SONGS sheet by publishedAt DESC.');
    }

    if (oldSongs.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'SONGS_LONG!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: oldSongs },
      });
      console.log(`Appended ${oldSongs.length} old songs to SONGS_LONG sheet.`);
      
      // Sort SONGS_LONG (SheetId: 453469018)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              sortRange: {
                range: {
                  sheetId: 453469018,
                  startRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 4
                },
                sortSpecs: [
                  {
                    dimensionIndex: 3,
                    sortOrder: 'DESCENDING'
                  }
                ]
              }
            }
          ]
        }
      });
      console.log('Sorted SONGS_LONG sheet by publishedAt DESC.');
    }
  }

  // 8. Sync to BQ (songs_master)
  if (newSongsData.length > 0) {
    const bqRows = newSongsData.map(s => ({
      videoId: s.videoId,
      artist: s.artist,
      title: s.title,
      publishedAt: s.publishedAt,
      eventTag: s.eventTag,
      category: s.category,
      detectedArtist: s.detectedArtist,
      analyzedReason: s.analyzedReason,
      description: s.description,
      topComments: s.topComments,
      classificationSource: s.classificationSource
    }));
    const tempFilePath = join(os.tmpdir(), `songs_master_${Date.now()}.json`);
    const ndjson = bqRows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(tempFilePath, ndjson);

    await bq.dataset(DATASET_ID).table(TABLE_SONGS).load(tempFilePath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    fs.unlinkSync(tempFilePath);
    console.log(`Synced ${bqRows.length} songs to BigQuery (songs_master).`);
  }

  console.log('--- Song Discovery (Node.js) Completed ---');
  await updateProcessStatus('Discovery: Completed', newSongsData.length, newSongsData.length, 'completed');
  
  const failureMsg = failedArtists.length > 0 
    ? `\n❌ <b>失敗: ${failedArtists.length}名</b>\n${failedArtists.join('\n')}`
    : '';

  await sendTelegramNotification(
    `✅ <b>新曲探索完了</b>\n` +
    `対象: ${artistsToProcess.length}名中 ${successCount}名成功\n` +
    `追加された曲: ${newSongsData.length}件` +
    (newlyRegisteredArtists.length > 0 ? `\n✨ <b>新規登録: ${newlyRegisteredArtists.length}名</b>\n${newlyRegisteredArtists.join(', ')}` : '') +
    failureMsg
  );
}

function parseDuration(duration) {
    if (!duration) return 0;
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
