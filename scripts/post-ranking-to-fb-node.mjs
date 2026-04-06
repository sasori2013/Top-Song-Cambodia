import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_PAGE_ID = '971418716059046';
const PROJECT_ID = process.env.GCP_PROJECT_ID;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|[' Grams"']$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function postToFacebook() {
  console.log('--- Forced Facebook Posting (Usual Format: 4 Images) Started ---');

  // 1. Fetch ranking for 2026-04-04 (Latest valid data)
  const query = `
    SELECT r.rank, s.artist, s.title, r.heatScore,
           s.videoId -- For potential thumbnail/OG generation
    FROM \`heat_ranking.rank_history\` r 
    JOIN \`heat_ranking.songs_master\` s ON r.videoId = s.videoId 
    WHERE r.date = \"2026-04-04\" AND r.type = \"DAILY\" 
    ORDER BY r.rank ASC LIMIT 10
  `;
  
  const [rows] = await bq.query(query);
  if (rows.length === 0) {
    console.error('No ranking data found for 2026-04-04.');
    return;
  }

  const dateStr = '2026.04.05'; // Yesterday's label
  const baseUrl = 'https://heat-kh.vercel.app/api/og/ranking';

  // 2. Generate OG Image URLs
  const ogUrls = [];
  
  // Rank 1
  const r1 = rows[0];
  const r1Url = `${baseUrl}?template=rank1&rank=1&artist=${encodeURIComponent(r1.artist)}&title=${encodeURIComponent(r1.title)}&heatPoint=${Math.round(r1.heatScore)}&date=${encodeURIComponent(dateStr)}&growth=0&views=--&change=STAY&engagement=--&insight=`;
  ogUrls.push(r1Url);

  // Multi images (Rank 2-4, 5-7, 8-10)
  for (let i = 0; i < 3; i++) {
    const start = 1 + (i * 3);
    const items = rows.slice(start, start + 3).map(x => ({
      rank: x.rank,
      artist: x.artist,
      title: x.title,
      change: 'STAY'
    }));
    if (items.length > 0) {
      const multiUrl = `${baseUrl}?template=multi&items=${encodeURIComponent(JSON.stringify(items))}&date=${encodeURIComponent(dateStr)}`;
      ogUrls.push(multiUrl);
    }
  }

  console.log(`Prepared ${ogUrls.length} OG Image URLs.`);

  // 3. Upload Photos to FB (Unpublished)
  const photoIds = [];
  for (const url of ogUrls) {
    console.log(`Uploading photo: ${url.substring(0, 50)}...`);
    const fbRes = await fetch(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url,
        published: 'false',
        access_token: FB_ACCESS_TOKEN
      })
    });
    const data = await fbRes.json();
    if (data.id) {
      photoIds.push(data.id);
    } else {
      console.error('Photo upload failed:', data);
    }
  }

  if (photoIds.length === 0) {
    console.error('Failed to upload any photos.');
    return;
  }

  // 4. Create Feed Post with attached media
  const message = `HEAT (BETA) - Cambodia Daily Ranking\n${dateStr}\n\n#1 ${r1.artist} – ${r1.title}\n${Math.round(r1.heatScore)} HEAT POINT (STAY)\n\nFull Top 40 ranking in the first comment or visit our site!`;

  const feedPayload = {
    message: message,
    access_token: FB_ACCESS_TOKEN
  };
  
  // FB expects media in reverse or specific order (1st one shows big)
  photoIds.forEach((id, i) => {
    feedPayload[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });

  const postRes = await fetch(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedPayload)
  });

  const result = await postRes.json();
  if (result.id) {
    console.log('✅ Successfully posted with images! ID:', result.id);
    
    // 5. Add Comment
    const commentRes = await fetch(`https://graph.facebook.com/v19.0/${result.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Full Ranking & History:\nhttps://heat-kh.vercel.app/\nUpdated Daily (Cambodia 20:30)',
        access_token: FB_ACCESS_TOKEN
      })
    });
    const cData = await commentRes.json();
    console.log('Comment status:', cData.id ? 'Success' : 'Failed');

  } else {
    console.error('❌ Failed to post feed:', result);
  }
}

postToFacebook().catch(console.error);
