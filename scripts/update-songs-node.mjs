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

const MAX_DAILY_QUOTA = 35000;
const MAX_DURATION_SEC = 900; // 15 minutes limit to exclude streams/albums
let currentQuotaUsage = 0;

const NG_WORDS = [
  'teaser', 'trailer', 'preview', 'behind', 'making',
  'version', 'ver.', 'live', 'performance',
  'dance practice', 'karaoke', 'remix', 'reaction',
  'stream', 'gaming', 'vlog', 'variety', 'interview',
  'full show', 'podcast', 'behind the scenes'
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

  // 1.5 Get Artist Aliases
  let aliasMap = new Map();
  try {
    const resAliases = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artist_Aliases!A2:B' });
    (resAliases.data.values || []).forEach(r => {
      const official = (r[0] || '').trim();
      const alias = (r[1] || '').trim();
      if (official && alias) {
        aliasMap.set(alias.toLowerCase().replace(/\s+/g, ''), official);
      }
    });
  } catch (e) {
    console.warn('Could not fetch Artist_Aliases sheet. Make sure it is created.', e.message);
  }

  // 1.6 Get Label_Roster
  let rosterMap = new Map();
  try {
    const resRoster = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A2:C' });
    (resRoster.data.values || []).forEach(r => {
      const prodName = (r[0] || '').trim();
      const targetArtist = (r[1] || '').trim();
      const keywordsRaw = (r[2] || '').trim();
      if (prodName && targetArtist && keywordsRaw) {
        if (!rosterMap.has(prodName)) rosterMap.set(prodName, []);
        const keywords = keywordsRaw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        rosterMap.get(prodName).push({ targetArtist, keywords });
      }
    });
  } catch (e) {
    console.warn('Could not fetch Label_Roster sheet.', e.message);
  }

  const normalizeArtistName = (name) => {
    if (!name) return '';
    let cleanName = name.trim();
    
    // Automatically remove suffixes like "-official", "official channel", "-music"
    cleanName = cleanName.replace(/-?\s*official(?:\s+channel)?$/i, '');
    cleanName = cleanName.replace(/-?\s*music$/i, '').trim();

    const normalizeKey = cleanName.toLowerCase().replace(/\s+/g, '');
    
    // Check aliases first
    if (aliasMap.has(normalizeKey)) {
        return aliasMap.get(normalizeKey);
    }
    
    // Check official names (fuzzy matching on lowercase + no space)
    for (const official of knownArtistNames) {
        const officialKey = official.toLowerCase().replace(/\s+/g, '');
        if (officialKey === normalizeKey) {
            return official; // Return the exact official casing
        }
    }
    
    // Fallback: return the cleaned name
    return cleanName;
  };

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
      let channelItems = [];
      
      // --- Unified Strict Discovery: Scan Official Uploads Playlist ONLY ---
      const resChannel = await youtube.channels.list({
        part: ['contentDetails'],
        id: [artist.channelId]
      });
      currentQuotaUsage += 1;
      const uploadsPlaylistId = resChannel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      
      if (uploadsPlaylistId) {
        let nextPageToken = null;
        let pageCount = 0;
        do {
          const resItems = await youtube.playlistItems.list({
            part: ['contentDetails', 'snippet'],
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: nextPageToken
          });
          currentQuotaUsage += 1;
          const items = (resItems.data.items || []).map(it => ({
            id: it.contentDetails.videoId,
            title: it.snippet.title,
            publishedAt: it.snippet.publishedAt
          }));
          
          channelItems.push(...items);
          nextPageToken = resItems.data.nextPageToken;
          pageCount++;
          
          // Optimization: If NOT a new artist, 1-2 pages are usually enough for daily sync
          if (!isNewArtist && pageCount >= 2) break;
          // Security: Prevent infinite loops if metadata is messy
          if (pageCount >= 50) break; 
        } while (nextPageToken);
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

                const SAFE_WORDS = ['music video', 'official mv', 'original mv', 'lyric video', 'lyrics video'];
                const matchedNG = NG_WORDS.find(ng => title.includes(ng));
                const isSafe = SAFE_WORDS.some(sw => title.includes(sw));

                if (matchedNG && !isSafe) {
                    console.log(`  Skipped (NG Word: "${matchedNG}"): ${vid.snippet.title}`);
                    continue;
                }
                
                const totalSec = parseDuration(duration);
                if (totalSec <= 60) {
                    console.log(`  Skipped (Short): ${vid.snippet.title} (${totalSec}s)`);
                    continue;
                }
                if (totalSec > MAX_DURATION_SEC) {
                    console.log(`  Skipped (Too Long): ${vid.snippet.title} (${totalSec}s)`);
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
                const isLabel = artist.type === 'Label' || artist.type === 'Production' || artist.type === 'P'; // Treat P as Label here just in case
                const classification = await classifySong(vid.id, vid.snippet.title, vid.snippet.description, isLabel);
                
                // We completely ignore AI artist detection due to excessive noise.
                classification.detectedArtist = '';

                // --- Overwrite Detected Artist securely with Label_Roster mapping ---
                if (rosterMap.has(artist.name)) {
                  const titleLower = vid.snippet.title.toLowerCase();
                  for (const candidate of rosterMap.get(artist.name)) {
                     const isMatch = candidate.keywords.some(kw => titleLower.includes(kw));
                     if (isMatch) {
                       classification.detectedArtist = candidate.targetArtist;
                       // We don't overwrite artist.name to keep the Production name safe
                       break;
                     }
                  }
                }

                newSongsData.push({
                  videoId: vid.id,
                  artist: artist.name,
                  title: vid.snippet.title,
                  cleanTitle: '', // Will be filled by background job
                  publishedAt: vid.snippet.publishedAt,
                  eventTag: classification.eventTag || 'None',
                  category: classification.category || 'Other',
                  detectedArtist: classification.detectedArtist || '',
                  featuring: '', // Added field
                  analyzedReason: classification.reason || '',
                  description: vid.snippet.description || '',
                  topComments: classification.topComments || '',
                  classificationSource: 'AI',
                  isRecent
                });
                existingIds.add(vid.id); // Prevent same video being added for multiple artists (collaborations)
                
                // --- Detect and split main artist/featuring from classification ---
                if (classification.detectedArtist) {
                  const rawName = String(classification.detectedArtist).trim();
                  if (rawName && rawName !== 'Various Artists') {
                    const delimiters = /\s*(?:x|&|,|ft\.?|feat\.?|\||\/|_| - | – | — )\s*/i;
                    const parts = rawName.split(delimiters).map(p => p.trim()).filter(Boolean);
                    const normalizedNames = parts.map(p => normalizeArtistName(p));
                    
                    const currentEntry = newSongsData[newSongsData.length - 1];
                    currentEntry.detectedArtist = normalizedNames[0]; 
                    currentEntry.featuring = normalizedNames.slice(1).join(', ');
                  }
                }
                
                console.log(`  NEW (${isRecent ? 'Recent' : 'Old'}): ${vid.snippet.title}`);
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
      s.videoId, s.artist, s.title, s.cleanTitle, s.publishedAt, s.eventTag, s.category, s.detectedArtist, s.featuring, `https://www.youtube.com/watch?v=${s.videoId}`
    ]);
    const oldSongs = newSongsData.filter(s => !s.isRecent).map(s => [
      s.videoId, s.artist, s.title, s.cleanTitle, s.publishedAt, s.eventTag, s.category, s.detectedArtist, s.featuring, `https://www.youtube.com/watch?v=${s.videoId}`
    ]);

    if (recentSongs.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'SONGS!A:J',
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
                  endColumnIndex: 10
                },
                sortSpecs: [
                  {
                    dimensionIndex: 4, // Column E (0-based)
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
        range: 'SONGS_LONG!A:I',
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
                  endColumnIndex: 10
                },
                sortSpecs: [
                  {
                    dimensionIndex: 4,
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
      cleanTitle: s.cleanTitle,
      publishedAt: s.publishedAt,
      eventTag: s.eventTag,
      category: s.category,
      detectedArtist: s.detectedArtist,
      featuring: s.featuring, // Added field
      analyzedReason: s.analyzedReason,
      description: s.description,
      topComments: s.topComments,
      classificationSource: s.classificationSource
    }));
    const tempFilePath = join(os.tmpdir(), `songs_master_${Date.now()}.json`);
    const ndjson = bqRows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(tempFilePath, ndjson);
    const tempTableId = `songs_master_temp_${Date.now()}`;
    await bq.dataset(DATASET_ID).table(tempTableId).load(tempFilePath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: [
        {name: 'videoId', type: 'STRING'},
        {name: 'artist', type: 'STRING'},
        {name: 'title', type: 'STRING'},
        {name: 'cleanTitle', type: 'STRING'},
        {name: 'publishedAt', type: 'TIMESTAMP'},
        {name: 'eventTag', type: 'STRING'},
        {name: 'category', type: 'STRING'},
        {name: 'detectedArtist', type: 'STRING'},
        {name: 'featuring', type: 'STRING'},
        {name: 'analyzedReason', type: 'STRING'},
        {name: 'description', type: 'STRING'},
        {name: 'topComments', type: 'STRING'},
        {name: 'classificationSource', type: 'STRING'}
      ]}
    });

    await bq.query(`
      MERGE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_SONGS}\` T
      USING \`${PROJECT_ID}.${DATASET_ID}.${tempTableId}\` S
      ON T.videoId = S.videoId
      WHEN NOT MATCHED THEN
        INSERT ROW
      WHEN MATCHED THEN
        UPDATE SET 
          T.artist = IF(T.classificationSource = 'ARTIST_FIXED', T.artist, S.artist), 
          T.title = S.title, 
          T.cleanTitle = S.cleanTitle,
          T.publishedAt = S.publishedAt, 
          T.eventTag = S.eventTag, 
          T.category = S.category, 
          T.detectedArtist = IF(T.classificationSource = 'ARTIST_FIXED', '', S.detectedArtist), 
          T.featuring = S.featuring,
          T.analyzedReason = S.analyzedReason,
          T.description = S.description,
          T.topComments = S.topComments,
          T.classificationSource = S.classificationSource
    `);
    
    await bq.dataset(DATASET_ID).table(tempTableId).delete();
    fs.unlinkSync(tempFilePath);
    console.log(`Merged ${bqRows.length} songs to BigQuery (songs_master).`);
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
