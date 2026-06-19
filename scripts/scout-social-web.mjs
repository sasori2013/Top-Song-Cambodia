import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { sendTelegramNotification } from './telegram-node.mjs';
import { scrapePages, extractYouTubeLinks } from './fb-community/apify-scraper.mjs';
import { BigQuery } from '@google-cloud/bigquery';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const LOCATION = 'us-central1';

if (!SHEET_ID || !PROJECT_ID || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials or configuration missing in environment.');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const sheetsAuth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

const vertexAuth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

// Vertex AI Gemini Prompting Helper
async function callGemini(prompt) {
  const client = await vertexAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 250, temperature: 0.1 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Gemini API failed: ${response.status}`);
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  text = text.replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ── Web RSS & News Crawler ───────────────────────────────────────────────────
async function scoutEntertainmentNews(targetUrl, sourceName = 'Sabay News RSS') {
  console.log(`\n--- Crawling Web News (${sourceName}) ---`);
  
  try {
    const res = await fetch(targetUrl, { timeout: 15000 });
    if (!res.ok) throw new Error(`Failed to fetch ${sourceName}: ${res.status}`);
    
    const html = await res.text();
    const $ = cheerio.load(html);
    const articles = [];
    
    // Extract articles from links matching standard structure
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      
      const isArticleLink = href.includes('/article/') || href.includes('/story/');
      if (isArticleLink && text.length > 12) {
        let fullUrl = href;
        if (!href.startsWith('http')) {
          const origin = new URL(targetUrl).origin;
          fullUrl = `${origin}${href}`;
        }
        // Deduplicate
        if (!articles.some(a => a.url === fullUrl)) {
          articles.push({ title: text, url: fullUrl });
        }
      }
    });

    console.log(`Extracted ${articles.length} news articles from ${sourceName}.`);
    
    const candidates = [];
    // Process top 10 articles to avoid heavy AI loads
    for (const art of articles.slice(0, 10)) {
      console.log(`  Evaluating article: "${art.title.slice(0, 45)}..."`);
      
      const prompt = `
You are a Cambodian pop music expert. Analyze this entertainment news title:
Title: "${art.title}"

Does this headline mention a new song release, debut, or a rising Cambodian music artist/singer?
If yes, extract:
1. Artist Name (official English/Latin display name)
2. Song Title (if mentioned, otherwise "")

Rules:
- Do NOT capture established superstars (e.g. VannDa, G-Devith, Tep Boprek, Preap Sovath, Sinn Sisamouth) if they are just mentioned generally.
- If it's a new or rising artist, or a fresh debut, return isNewArtist: true.
- Otherwise, return isNewArtist: false.

Output ONLY JSON:
{
  "isNewArtist": true/false,
  "artistName": "...",
  "songTitle": "...",
  "reason": "..."
}
`;
      try {
        const resAI = await callGemini(prompt);
        if (resAI.isNewArtist && resAI.artistName) {
          console.log(`    ⭐ [AI Discovery] Found New Artist: "${resAI.artistName}". Reason: ${resAI.reason}`);
          candidates.push({
            name: resAI.artistName,
            source: sourceName,
            reason: `Article: "${art.title}" — ${resAI.reason}`,
            url: art.url
          });
        }
      } catch (e) {
        console.warn(`    AI parse failed for article:`, e.message);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return candidates;
  } catch (err) {
    console.error(`Error crawling ${sourceName}:`, err.message);
    return [];
  }
}

// ── Facebook Scouting Crawler ─────────────────────────────────────────────────
async function scoutFacebookPages(fbPages) {
  console.log('\n--- Scraping Facebook Scouting Pages ---');
  if (fbPages.length === 0) {
    console.log('No Facebook pages enabled for scouting.');
    return [];
  }
  let rawPosts = [];
  
  try {
    rawPosts = await scrapePages(fbPages, 5); // Scrape latest 5 posts per page
  } catch (e) {
    console.error('Apify Facebook scraping failed:', e.message);
    return [];
  }

  if (rawPosts.length === 0) {
    console.log('No posts returned from Facebook scouting.');
    return [];
  }

  // Extract unique YouTube video IDs
  const videoIds = new Set();
  for (const post of rawPosts) {
    const urls = extractYouTubeLinks(post);
    urls.forEach(id => videoIds.add(id));
  }

  console.log(`Extracted ${videoIds.size} unique YouTube video links from Facebook posts.`);
  if (videoIds.size === 0) return [];

  // Check if they already exist in BigQuery songs_master
  const listIds = Array.from(videoIds);
  const qIds = listIds.map(id => `'${id}'`).join(',');
  
  let existingBqIds = new Set();
  try {
    const [rows] = await bq.query(`
      SELECT videoId FROM \`heat_ranking.songs_master\`
      WHERE videoId IN (${qIds})
    `);
    rows.forEach(r => existingBqIds.add(r.videoId));
    console.log(`Filtered out ${existingBqIds.size} already-indexed videos.`);
  } catch (err) {
    console.warn('BigQuery lookup warning (using empty list):', err.message);
  }

  const newVideoIds = listIds.filter(id => !existingBqIds.has(id));
  console.log(`${newVideoIds.length} video links are completely new. Fetching YouTube details...`);

  const candidates = [];

  // Query YouTube video details in chunks
  for (let i = 0; i < newVideoIds.length; i += 50) {
    const chunk = newVideoIds.slice(i, i + 50);
    try {
      const resVid = await youtube.videos.list({
        part: ['snippet', 'contentDetails'],
        id: chunk
      });

      for (const item of (resVid.data.items || [])) {
        const title = item.snippet.title;
        const desc = item.snippet.description;
        const channelTitle = item.snippet.channelTitle;
        const channelId = item.snippet.channelId;

        // Skip standard label channels (Town, Sunday, Ream) to let updateSongs handle them normally
        const skipLabels = ['town', 'sunday', 'ream', 'galaxy', 'hang meas', 'sastra', 'smart'];
        const lowChan = channelTitle.toLowerCase();
        if (skipLabels.some(lbl => lowChan.includes(lbl))) {
          continue;
        }

        console.log(`  Evaluating video: "${title}" by "${channelTitle}"`);

        const prompt = `
You are a Cambodian music expert. Analyze this YouTube video metadata:
Title: "${title}"
Channel Name: "${channelTitle}"
Description: "${desc.slice(0, 500)}"

Determine if this is a newly released Cambodian original music video/song (Original MV, modern pop, hip-hop, indie release).
If yes, extract:
1. Singer/Artist Name (English/Latin display name)
2. Song Genre / Category

Rules:
- It MUST be a Cambodian release (Khmer language or Cambodian artist).
- It MUST be original music, not gaming videos, covers by fans, news clips, or multi-hour compilations.
- If verified as a valid Cambodian original song release, return isValid: true.
- Otherwise, return isValid: false.

Output ONLY JSON:
{
  "isValid": true/false,
  "artistName": "...",
  "genre": "...",
  "reason": "..."
}
`;
        try {
          const resAI = await callGemini(prompt);
          if (resAI.isValid && resAI.artistName) {
            console.log(`    ⭐ [AI Discovery] Found New Independent Talent: "${resAI.artistName}". Reason: ${resAI.reason}`);
            candidates.push({
              name: resAI.artistName,
              channelId: channelId,
              channelTitle: channelTitle,
              source: `Facebook Community Scout`,
              reason: `Video: "${title}" — ${resAI.reason}`,
              url: `https://www.youtube.com/watch?v=${item.id}`
            });
          }
        } catch (e) {
          console.warn(`    AI classification failed for video:`, e.message);
        }
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error('Error fetching videos details:', err.message);
    }
  }

  return candidates;
}

// ── Main Execution ──────────────────────────────────────────────────────────
async function runScouting() {
  console.log(`\n=== HADE Social & Web Scouting Started (${DRY_RUN ? 'DRY RUN' : 'ACTIVE MODE'}) ===\n`);

  // Load Scouting Sources dynamically from Google Sheets
  console.log('Loading Scouting Sources from Google Sheets...');
  let fbPages = [];
  let webSources = [];

  try {
    const resSources = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Scouting_Sources!A2:D'
    });
    const sourceRows = resSources.data.values || [];

    for (const r of sourceRows) {
      const name = (r[0] || '').trim();
      const url = (r[1] || '').trim();
      const type = (r[2] || '').trim();
      const enabled = (r[3] || '').trim().toUpperCase() === 'TRUE';

      if (url && enabled) {
        if (type === 'Facebook') {
          fbPages.push(url);
        } else if (type === 'Web News') {
          webSources.push({ name, url });
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Could not fetch Scouting_Sources tab. Using fallback seed targets.', err.message);
    fbPages = [
      'https://www.facebook.com/PlengbySmart',
      'https://www.facebook.com/kcdplay',
      'https://www.facebook.com/sachtube'
    ];
    webSources = [{ name: 'Sabay News Entertainment', url: 'https://news.sabay.com.kh/topics/entertainment' }];
  }

  console.log(`Loaded enabled sources: ${fbPages.length} Facebook pages, ${webSources.length} Web News targets.`);

  // Load registered list to filter out already tracked artists/channels
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:C' });
  const artistRows = resArtists.data.values || [];
  
  const registeredNames = new Set(artistRows.map(r => r[0].toLowerCase().trim().replace(/\s+/g, '')));
  const registeredIds = new Set(artistRows.map(r => (r[2] || '').trim()).filter(Boolean));

  // Load current Discovery Queue to avoid double staging
  const resQueue = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Discovery_Queue!A2:C' });
  const queueRows = resQueue.data.values || [];
  const queuedNames = new Set(queueRows.map(r => r[0].toLowerCase().trim().replace(/\s+/g, '')));
  const queuedIds = new Set(queueRows.map(r => (r[1] || '').trim()).filter(Boolean));

  const rawCandidates = [];

  // Run Tiers dynamically
  for (const webSource of webSources) {
    const newsCandidates = await scoutEntertainmentNews(webSource.url, webSource.name);
    rawCandidates.push(...newsCandidates);
  }

  if (fbPages.length > 0) {
    const fbCandidates = await scoutFacebookPages(fbPages);
    rawCandidates.push(...fbCandidates);
  }

  console.log(`\nCollected ${rawCandidates.length} candidate discoveries. Filtering duplicates...`);

  const filteredCandidates = [];
  const processedNamesInRun = new Set();

  for (const cand of rawCandidates) {
    const normName = cand.name.toLowerCase().trim().replace(/\s+/g, '');
    
    // Skip if already in Artists sheet
    if (registeredNames.has(normName) || (cand.channelId && registeredIds.has(cand.channelId))) {
      continue;
    }
    // Skip if already staged in Discovery Queue
    if (queuedNames.has(normName) || (cand.channelId && queuedIds.has(cand.channelId))) {
      continue;
    }
    // Skip duplicates inside same scouting run
    if (processedNamesInRun.has(normName)) {
      continue;
    }

    processedNamesInRun.add(normName);
    filteredCandidates.push(cand);
  }

  console.log(`Found ${filteredCandidates.length} brand new, unique scouting candidates.`);

  if (filteredCandidates.length === 0) {
    console.log('No new candidates to stage today.');
    return;
  }

  // Process and stage each candidate (fetch channel statistics if channelId is known, or look it up)
  const khrDate = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date());

  for (const cand of filteredCandidates) {
    console.log(`Staging candidate: "${cand.name}" from ${cand.source}`);
    
    try {
      let channelId = cand.channelId || '';
      let channelTitle = cand.channelTitle || cand.name;
      let subs = 0;

      // If we don't have channelId (e.g. from news article), perform a YouTube search to resolve it
      if (!channelId) {
        console.log(`  Searching YouTube to resolve channel for "${cand.name}"...`);
        const sRes = await youtube.search.list({
          part: ['snippet'],
          q: `${cand.name} Official Channel`,
          type: ['channel'],
          maxResults: 1
        });
        const ch = sRes.data.items?.[0];
        if (ch) {
          channelId = ch.id.channelId;
          channelTitle = ch.snippet.title;
        }
      }

      // Fetch official channel stats if ID was found
      if (channelId) {
        const statsRes = await youtube.channels.list({
          part: ['snippet', 'statistics'],
          id: [channelId]
        });
        const fullChan = statsRes.data.items?.[0];
        if (fullChan) {
          subs = parseInt(fullChan.statistics.subscriberCount) || 0;
        }
      }

      const channelUrl = channelId ? `https://www.youtube.com/channel/${channelId}` : '';

      // Google Sheet tab columns:
      // 1. Artist Name, 2. YouTube Channel ID, 3. YouTube Channel URL, 4. Subscribers, 
      // 5. Source, 6. Scouted Reason, 7. Detected At, 8. Status (Pending)
      const newRow = [
        cand.name,                   // 1. Artist Name
        channelId,                   // 2. Channel ID
        channelUrl,                  // 3. Channel URL
        subs,                        // 4. Subscribers
        cand.source,                 // 5. Source
        cand.reason,                 // 6. Scouted Reason
        khrDate,                     // 7. Detected At
        'Pending'                    // 8. Status
      ];

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would write new row to Discovery_Queue: ${JSON.stringify(newRow)}`);
      } else {
        console.log(`  Writing to Google Sheets Discovery_Queue...`);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Discovery_Queue!A:H',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [newRow] }
        });

        // Track in-memory to prevent duplicate appends in this run
        queuedNames.add(cand.name.toLowerCase().trim().replace(/\s+/g, ''));
        if (channelId) queuedIds.add(channelId);

        // Send Telegram alert
        const telegramMsg = `
✨ <b>【HADE】 新アーティスト外部巡回検知</b>

📰 <b>発見ソース</b>: ${cand.source}
👤 <b>候補アーティスト名</b>: <b>${cand.name}</b>
📊 <b>チャンネル登録者数</b>: ${channelId ? `${subs.toLocaleString()}人` : '不明 (YouTubeチャンネル要特定)'}
🔗 <b>YouTube</b>: ${channelId ? `<a href="${channelUrl}">${channelTitle}</a>` : '未登録'}
📝 <b>スカウト検出理由</b>: ${cand.reason}
👉 <b>対象参考URL</b>: <a href="${cand.url}">こちら</a>
`;
        await sendTelegramNotification(telegramMsg);
        console.log(`  Staged & Telegram Notification sent!`);
      }

      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  Failed to fully resolve candidate "${cand.name}":`, e.message);
    }
  }

  console.log(`\n=== HADE Social & Web Scouting Completed ===\n`);
}

// Automatically execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runScouting().catch(console.error);
}
