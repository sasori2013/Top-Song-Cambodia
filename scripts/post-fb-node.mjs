import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch'; // need node-fetch v2/v3
import FormData from 'form-data';
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
const FB_ACCESS_TOKEN = getEnv('FB_ACCESS_TOKEN');
const PAGE_ID = '971418716059046';
const OG_BASE_URL = 'https://heat-kh.vercel.app/api/og/ranking';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !FB_ACCESS_TOKEN) {
  console.error('Error: Credentials missing (GOOGLE_SERVICE_ACCOUNT_JSON or FB_ACCESS_TOKEN)');
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

async function runPostFB() {
  // 1. Get Top Rankings from RANKING_DAILY sheet
  const resRank = await sheets.spreadsheets.values.get({ 
      spreadsheetId: SHEET_ID, 
      range: 'RANKING_DAILY!A2:Z11' // Get Top 10
  });
  const rows = resRank.data.values || [];
  if (rows.length === 0) {
      console.log('No ranking data found in RANKING_DAILY.');
      await sendTelegramNotification('⚠️ <b>FB投稿中断:</b> ランキングデータが存在しません。');
      return;
  }

  const ranking = rows.map(r => ({
      date: r[0],
      rank: parseInt(r[1]),
      prevRank: (r[2] && !isNaN(parseInt(r[2]))) ? parseInt(r[2]) : null,
      artist: r[3],
      title: r[4],
      heatScore: parseFloat(r[13]), // Column N
      growth: r[15],                // Column P (Growth %)
      views: r[17],                 // Column R (IncrV 1d)
      rankChange: (r[2] && !isNaN(parseInt(r[2]))) ? parseInt(r[2]) - parseInt(r[1]) : 'NEW',
      engagement: r[16],            // Column Q (Reaction Rate)
      shortInsight: r[10]           // Column K (Short Insight)
  }));

  const r1 = ranking[0];
  const dateStr = r1.date.replace(/-/g, '.');

  await sendTelegramNotification(`📱 <b>Facebookへの自動投稿 (postFB)</b> を開始します...\n(対象日: ${dateStr})`);
  await updateProcessStatus('Post: Fetching Rankings', 0, 100);

  // 2. Generate OG Image URLs
  const ogUrls = [];
  
  // 1位テンプレート
  const r1Url = `${OG_BASE_URL}?template=rank1&rank=1&artist=${encodeURIComponent(r1.artist)}&title=${encodeURIComponent(r1.title)}&heatPoint=${Math.round(r1.heatScore)}&growth=${encodeURIComponent(r1.growth)}&views=${encodeURIComponent(rows[0][17])}&change=${r1.rankChange}&engagement=${encodeURIComponent(r1.engagement)}&insight=${encodeURIComponent(r1.shortInsight || '')}&date=${encodeURIComponent(dateStr)}`;
  ogUrls.push(r1Url);

  // Multiテンプレート (2-4, 5-7, 8-10)
  for (let i = 0; i < 3; i++) {
    const start = 1 + (i * 3);
    const items = ranking.slice(start, start + 3).map(x => ({
        rank: x.rank,
        artist: x.artist,
        title: x.title,
        change: x.rankChange === 'NEW' ? 'NEW' : (x.rankChange < 0 ? '+' + Math.abs(x.rankChange) : (x.rankChange > 0 ? '-' + x.rankChange : '0'))
    }));
    if (items.length > 0) {
        const multiUrl = `${OG_BASE_URL}?template=multi&items=${encodeURIComponent(JSON.stringify(items))}&date=${encodeURIComponent(dateStr)}`;
        ogUrls.push(multiUrl);
    }
  }

  // 3. Download Images
  console.log(`Downloading ${ogUrls.length} images...`);
  await updateProcessStatus('Post: Generating Images', 20, 100);
  const imageBuffers = await Promise.all(ogUrls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OG Image Download failed: ${res.statusText}`);
      return res.buffer();
  }));

  // 4. Upload to Facebook (Unpublished Photos)
  console.log('Uploading images to Facebook...');
  await updateProcessStatus('Post: Uploading to FB', 50, 100);
  const photoIds = [];
  for (const buffer of imageBuffers) {
      const form = new FormData();
      form.append('source', buffer, { filename: 'ranking.png' });
      form.append('published', 'false');
      form.append('access_token', FB_ACCESS_TOKEN);

      const fbRes = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/photos`, {
          method: 'POST',
          body: form
      });
      const json = await fbRes.json();
      if (json.error) throw new Error(`FB Photo Upload Error: ${json.error.message}`);
      photoIds.push(json.id);
  }

  // 5. Create Feed Post
  console.log('Creating Feed Post...');
  const r1MessageChange = r1.rankChange === 'NEW' ? 'NEW ENTRY' : (r1.rankChange < 0 ? '+' + Math.abs(r1.rankChange) : (r1.rankChange === 0 ? 'STAY' : '-' + r1.rankChange));
  const message = `HEAT (BETA) - Cambodia Daily Ranking\n${dateStr}\n\n#1 ${r1.artist} – ${r1.title}\n${Math.round(r1.heatScore)} HEAT POINT (${r1MessageChange})\n\nFull Top 20 ranking in the first comment`;

  // Use JSON body for robust array handling (attached_media)
  const feedBody = {
      message: message,
      access_token: FB_ACCESS_TOKEN,
      attached_media: photoIds.map(id => ({ media_fbid: id }))
  };

  const feedRes = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedBody)
  });
  const feedJson = await feedRes.json();
  if (feedJson.error) throw new Error(`FB Feed Post Error: ${feedJson.error.message}`);
  const postId = feedJson.id;
  console.log(`Feed posted: ${postId}`);

  // 6. Add Comment
  console.log('Adding Top Comment...');
  await updateProcessStatus('Post: Adding Comment', 90, 100);
  const commentParams = new URLSearchParams();
  commentParams.append('message', 'Full Top 20:\nhttps://heat-kh.vercel.app/\nUpdated daily.');
  commentParams.append('access_token', FB_ACCESS_TOKEN);

  const commentRes = await fetch(`https://graph.facebook.com/v19.0/${postId}/comments`, {
      method: 'POST',
      body: commentParams
  });
  const commentJson = await commentRes.json();
  if (commentJson.error) {
      console.warn('Comment failed (retrying with PageID prefix)...');
      const retryId = `${PAGE_ID}_${postId}`;
      await fetch(`https://graph.facebook.com/v19.0/${retryId}/comments`, {
          method: 'POST',
          body: commentParams
      });
  }

  console.log('--- Facebook Posting (Node.js) Completed ---');
  await updateProcessStatus('Post: Completed', 100, 100, 'completed');
  await sendTelegramNotification(`✅ <b>Facebook自動投稿完了</b>\n本日の1位: <b>${r1.artist}</b>\n<a href="https://facebook.com/${postId}">🔗 投稿を見る</a>`);
}

runPostFB().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>Facebook投稿エラー</b>\n<code>${error.message}</code>`);
});
