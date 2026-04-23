import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'snapshots';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials (GOOGLE_SERVICE_ACCOUNT_JSON or YOUTUBE_API_KEY) are missing in .env.local');
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
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY, timeout: 20000 });

async function withRetry(fn, label = '', maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      const delay = 1000 * Math.pow(2, attempt - 1);
      console.warn(`  [retry ${attempt}/${maxAttempts}] ${label}: ${e.message} → ${delay}ms後リトライ`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function getTodayKey() {
  const args = process.argv.slice(2);
  const forcedDate = args.find(a => a.startsWith('--date='))?.split('=')[1];
  if (forcedDate) return forcedDate;

  const d = new Date();
  const options = { timeZone: 'Asia/Phnom_Penh', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('fr-CA', options); // returns YYYY-MM-DD
  const dateStr = formatter.format(d);
  
  // If run VERY early morning (e.g. before 4 AM KHR), treat it as "Yesterday's" data
  const khrHour = parseInt(new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Asia/Phnom_Penh', hour: 'numeric', hour12: false 
  }).format(d));
  
  if (khrHour < 4) {
    const yesterday = new Date(d);
    yesterday.setDate(d.getDate() - 1);
    return formatter.format(yesterday);
  }
  return dateStr;
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
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.2, responseMimeType: 'application/json' }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error(`AI Analysis failed for ${videoId}:`, e.message);
    return { score: 0.5, summary: 'AI Analysis Error' };
  }
}

async function runSnapshotNode() {
  console.log('--- Daily Snapshot (Node.js) Started ---');
  await sendTelegramNotification('📊 <b>統計取得・AI監査 (dailySnapshot)</b> を開始します...');
  await updateProcessStatus('Snapshot: Fetching Video IDs', 0, 100);
  const todayKey = await getTodayKey();

  // 1. Get video IDs from SONGS
  const songRows = await fetchSheetData('SONGS!A2:C');

  const videoIds = [];
  const songsMap = new Map(); // id -> { title, row, sheetName }

  songRows.forEach((row, i) => {
    const id = (row[0] || '').trim();
    if (id) {
        videoIds.push(id);
        songsMap.set(id, { title: row[2], row: i + 2, sheetName: 'SONGS' });
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
    await updateProcessStatus('Snapshot: YouTube Stats', i, videoIds.length);
    
    try {
      const res = await withRetry(
        () => youtube.videos.list({ part: ['statistics', 'snippet'], id: chunk }),
        `videos.list chunk ${i / 50 + 1}`
      );

      const items = res.data.items || [];
      const foundIds = new Set(items.map(it => it.id));

      chunk.forEach(id => {
        if (!foundIds.has(id)) {
          const meta = songsMap.get(id);
          missingVideos.push({ id, ...meta });
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
    } catch (e) {
      console.error(`  YouTube API Chunk error (全${3}回失敗): ${e.message}`);
    }
  }

  // 2.5 Perform AI Quality Audit on Top 30 (by views)
  await ensureTableSchema();
  const sortedForAudit = [...snapshotsRows].sort((a, b) => b.views - a.views).slice(0, 100);
  console.log(`--- Performing AI Comment Quality Audit on Top 100 videos ---`);
  
  console.log(`--- Performing AI Comment Quality Audit on Top 100 videos (Parallelized) ---`);
  
  const auditConcurrency = 5;
  for (let i = 0; i < sortedForAudit.length; i += auditConcurrency) {
    const auditBatch = sortedForAudit.slice(i, i + auditConcurrency);
    console.log(`Auditing batch ${Math.floor(i/auditConcurrency) + 1}/${Math.ceil(sortedForAudit.length/auditConcurrency)}...`);
    
    await Promise.all(auditBatch.map(async (item) => {
      console.log(`  Analyzing: ${item.videoId} (${songsMap.get(item.videoId)?.title || 'Unknown'})`);
      const commentsList = await fetchComments(item.videoId);
      const audit = await analyzeCommentQuality(item.videoId, commentsList);
      
      const originalRow = snapshotsRows.find(r => r.videoId === item.videoId);
      if (originalRow) {
        originalRow.qualityScore = audit.score;
        originalRow.qualitySummary = audit.summary;
      }
    }));
    await updateProcessStatus('Snapshot: AI Audit', i + auditBatch.length, sortedForAudit.length);
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

    // NEW: Delete existing snapshots for the same date to prevent duplicates
    console.log(`Deleting existing snapshots for ${todayKey}...`);
    await bq.query(`DELETE FROM \`${DATASET_ID}.${TABLE_ID}\` WHERE date = '${todayKey}'`);

    const tempFilePath = join(os.tmpdir(), `snapshots_${todayKey}_${Date.now()}.json`);
    const ndjson = snapshotsRows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(tempFilePath, ndjson);

    await bq.dataset(DATASET_ID).table(TABLE_ID).load(tempFilePath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    fs.unlinkSync(tempFilePath);
    console.log('BigQuery insertion complete.');

    // 4.5 Integrity Check (NEW: Alerting on data gaps)
    try {
      const [countRows] = await bq.query(`
        SELECT CAST(date AS STRING) as d, COUNT(*) as total 
        FROM \`${DATASET_ID}.${TABLE_ID}\` 
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
        GROUP BY date ORDER BY date DESC
      `);
      
      if (countRows.length >= 2) {
        const latest = parseInt(countRows[0].total);
        // Use 2-day average if available, otherwise single previous day
        const baseline = countRows.length >= 3
          ? (parseInt(countRows[1].total) + parseInt(countRows[2].total)) / 2
          : parseInt(countRows[1].total);
        const ratio = latest / baseline;
        console.log(`Integrity Check: Today=${latest}, Baseline=${Math.round(baseline)} (Ratio: ${Math.round(ratio * 100)}%)`);

        if (ratio < 0.75) {
          await sendTelegramNotification(
            `🚨 <b>データ欠落アラート</b>\n` +
            `本日の取得件数が直近2日平均の<b>${Math.round(ratio * 100)}%</b> (${latest}/${Math.round(baseline)}) に低下しています。\n\n` +
            `YouTube APIのクォータ制限等により、一部の楽曲データが取得できていない可能性があります。`
          );
        }
      }
    } catch (checkError) {
      console.error('Integrity Check failed:', checkError.message);
    }
  }

  // 5. Handle missing videos (Highlight in Sheet and Notify)
  if (missingVideos.length > 0) {
    console.warn(`Warning: ${missingVideos.length} videos missing/deleted.`);
    
    const sheetUpdates = missingVideos.map(m => ({
      range: `${m.sheetName}!E${m.row}`, // Column E = Status
      values: [['[DELETED/PRIVATE]']]
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: sheetUpdates
      }
    });

    const listStr = missingVideos.slice(0, 15).map(m => 
      `- ${m.artist}: ${m.title}\n  <a href="https://youtu.be/${m.id}">🔗 リンクを表示</a>`
    ).join('\n');

    await sendTelegramNotification(
      `⚠️ <b>警告: ${missingVideos.length}件の動画が非公開/削除されました</b>\n` +
      `シート上で「[DELETED/PRIVATE]」とマークしました。\n\n` +
      listStr + (missingVideos.length > 15 ? '\n...他多数' : '')
    );
  }

  console.log('--- Daily Snapshot (Node.js) Completed ---');
  await updateProcessStatus('Snapshot: Completed', 100, 100, 'completed');
  await sendTelegramNotification(`✅ <b>統計データ取得とAI監査が完了しました</b>`);
}

runSnapshotNode().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>統計取得エラー</b>\n<code>${error.message}</code>`);
});

