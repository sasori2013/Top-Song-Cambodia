import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'snapshots';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY || !GEMINI_API_KEY) {
  console.error('Error: Credentials (GOOGLE_SERVICE_ACCOUNT_JSON, YOUTUBE_API_KEY, or GEMINI_API_KEY) are missing in .env.local');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

// Initialize Auth
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

// Initialize Google AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const generativeModel = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: { responseMimeType: 'application/json' }
});

async function getTodayKey() {
  const d = new Date();
  // Cambodia time/Local time key
  return d.toISOString().split('T')[0];
}

async function fetchSheetData(range) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
    return res.data.values || [];
}

async function ensureTableSchema() {
  console.log('Ensuring BigQuery table schema is up to date...');
  const dataset = bq.dataset(DATASET_ID);
  const table = dataset.table(TABLE_ID);
  const [metadata] = await table.getMetadata();
  const schema = metadata.schema.fields;

  const hasScore = schema.find(f => f.name === 'qualityScore');
  if (!hasScore) {
    console.log('Adding qualityScore and qualitySummary columns to BigQuery...');
    schema.push({ name: 'qualityScore', type: 'FLOAT' });
    schema.push({ name: 'qualitySummary', type: 'STRING' });
    await table.setMetadata({ schema: { fields: schema } });
  }
}

async function fetchComments(videoId) {
  try {
    const res = await youtube.commentThreads.list({
      part: ['snippet'],
      videoId: videoId,
      maxResults: 50,
      order: 'relevance',
    });
    return (res.data.items || []).map(it => ({
      author: it.snippet.topLevelComment.snippet.authorDisplayName,
      text: it.snippet.topLevelComment.snippet.textDisplay,
    }));
  } catch (e) {
    return [];
  }
}

async function analyzeCommentQuality(videoId, comments) {
  if (comments.length === 0) return { score: 0.5, summary: 'No comments found' };

  const prompt = `
    Analyze these YouTube comments for a music video. 
    Evaluate the "Quality" and detect "Inflation/Spam".
    
    Criteria:
    - Meaningful: Specific mention of lyrics, melody, voice, or emotions.
    - Inflation: Emoji-only, generic "Nice", repetitive bot-like content, many replies with just emojis.
    
    Comments:
    ${JSON.stringify(comments.slice(0, 50))}
    
    Output JSON:
    { "score": 0.0 to 1.0, "summary": "Short 1-sentence analysis" }
  `;

  try {
    const result = await generativeModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return JSON.parse(text);
  } catch (e) {
    console.error(`AI Analysis failed for ${videoId}:`, e.message);
    return { score: 0.5, summary: 'AI Analysis Error' };
  }
}

async function runSnapshotNode() {
  console.log('--- Daily Snapshot (Node.js) Started ---');
  await sendTelegramNotification('📊 <b>統計取得・AI監査 (dailySnapshot)</b> を開始します...');
  const todayKey = await getTodayKey();

  // 1. Get video IDs from SONGS and SONGS_LONG
  const songRows = await fetchSheetData('SONGS!A2:C');
  const songLongRows = await fetchSheetData('SONGS_LONG!A2:C');

  const videoIds = [];
  const songsMap = new Map(); // id -> { title, row, sheetName }

  songRows.forEach((row, i) => {
    const id = (row[0] || '').trim();
    if (id) {
        videoIds.push(id);
        songsMap.set(id, { title: row[2], row: i + 2, sheetName: 'SONGS' });
    }
  });

  songLongRows.forEach((row, i) => {
    const id = (row[0] || '').trim();
    if (id && !songsMap.has(id)) {
        videoIds.push(id);
        songsMap.set(id, { title: row[2], row: i + 2, sheetName: 'SONGS_LONG' });
    }
  });

  if (videoIds.length === 0) {
    console.log('No video IDs found.');
    return;
  }

  // 2. Fetch from YouTube API in chunks of 50
  const snapshotsRows = [];
  const missingVideos = [];
  
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    console.log(`Fetching YouTube stats for chunk ${i / 50 + 1}...`);
    
    const res = await youtube.videos.list({
      part: ['statistics'],
      id: chunk,
    });

    const items = res.data.items || [];
    const foundIds = new Set(items.map(it => it.id));

    chunk.forEach(id => {
      if (!foundIds.has(id)) {
        missingVideos.push(id);
      }
    });

    items.forEach(it => {
      const st = it.statistics || {};
      snapshotsRows.push({
        date: todayKey,
        videoId: it.id,
        views: parseInt(st.viewCount) || 0,
        likes: parseInt(st.likeCount) || 0,
        comments: parseInt(st.commentCount) || 0,
        qualityScore: null,
        qualitySummary: null,
      });
    });
  }

  // 2.5 Perform AI Quality Audit on Top 30 (by views)
  await ensureTableSchema();
  const sortedForAudit = [...snapshotsRows].sort((a, b) => b.views - a.views).slice(0, 30);
  console.log(`--- Performing AI Comment Quality Audit on Top 30 videos ---`);
  
  for (const item of sortedForAudit) {
    console.log(`Analyzing comments for: ${item.videoId} (${songsMap.get(item.videoId)?.title || 'Unknown'})`);
    const commentsList = await fetchComments(item.videoId);
    const audit = await analyzeCommentQuality(item.videoId, commentsList);
    
    // Update the original row in snapshotsRows
    const originalRow = snapshotsRows.find(r => r.videoId === item.videoId);
    if (originalRow) {
      originalRow.qualityScore = audit.score;
      originalRow.qualitySummary = audit.summary;
    }
  }

  // 3. Write to Google Sheets (APPEND to SNAPSHOT)
  if (snapshotsRows.length > 0) {
    const sheetValues = snapshotsRows.map(s => [s.date, s.videoId, s.views, s.likes, s.comments]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'SNAPSHOT!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: sheetValues },
    });
    console.log(`Updated SNAPSHOT sheet with ${snapshotsRows.length} rows.`);

    // 4. Write to BigQuery (INSERT)
    console.log('Inserting into BigQuery...');
    await bq.dataset(DATASET_ID).table(TABLE_ID).insert(snapshotsRows);
    console.log('BigQuery insertion complete.');
  }

  // 5. Handle missing videos (Highlight in RED)
  if (missingVideos.length > 0) {
    console.warn(`Warning: ${missingVideos.length} videos missing/deleted.`);
    await sendTelegramNotification(`⚠️ <b>警告: ${missingVideos.length}件の動画が非公開/削除されました</b>\nID: ${missingVideos.join(', ')}`);
  }

  console.log('--- Daily Snapshot (Node.js) Completed ---');
  await sendTelegramNotification(`✅ <b>統計データ取得とAI監査が完了しました</b>`);
}

runSnapshotNode().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>統計取得エラー</b>\n<code>${error.message}</code>`);
});

