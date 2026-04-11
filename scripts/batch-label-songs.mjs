import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { classifySong } from './classify-song-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});
const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });

/**
 * Fast classification without fetching comments (Phase 2) using Vertex AI
 */
async function classifySongFast(title, description) {
  try {
    const prompt = `
Analyze the following Cambodian music video and categorize it in clear, standard English.
Title: ${title}
Description: ${description}

Output ONLY a valid JSON object (Values MUST be in English):
{
  "eventTag": "Khmer New Year 2026", "Cambodian Idol S4", etc. or "None",
  "category": "Original MV", "Audition Performance", "Live Concert", "Dance Motion", or "Other",
  "reason": "English explanation"
}
`;
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.1 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    return { eventTag: "None", category: "Other", reason: "Error: " + e.message };
  }
}

async function runBatchLabeling() {
  console.log('--- Batch Labeling System Started ---');
  
  // 1. Fetch unlabeled songs (1000 at a time to avoid memory issues)
  const queryArr = await bq.query(`
    SELECT videoId, title, artist, publishedAt 
    FROM \`heat_ranking.songs_master\` 
    WHERE topComments IS NULL OR topComments = '' OR topComments = 'No comments available.' OR topComments = 'Error fetching'
    ORDER BY publishedAt DESC
    LIMIT 3000
  `);
  const rows = queryArr[0];
  console.log(`Found ${rows.length} songs to label.`);

  const recentThreshold = new Date('2026-03-01');
  const BATCH_SIZE = 50;
  console.log(`Processing ${rows.length} songs in chunks of ${BATCH_SIZE}...`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    console.log(`[Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(rows.length/BATCH_SIZE)}] AI Processing ${chunk.length} songs...`);

    // 1. Parallel API Fetch + Classification
    const videoIds = chunk.map(song => song.videoId);
    let descriptionMap = {};
    try {
      const res = await youtube.videos.list({
        part: ['snippet'],
        id: videoIds
      });
      (res.data.items || []).forEach(vid => {
        descriptionMap[vid.id] = vid.snippet?.description || '';
      });
    } catch (err) {
      console.warn("  ⚠️ Failed to fetch video descriptions:", err.message);
    }

    const results = [];
    for (let j = 0; j < chunk.length; j++) {
      const song = chunk[j];
      const desc = descriptionMap[song.videoId] || '';
      try {
        const classification = await classifySong(song.videoId, song.title, desc);
        results.push({ videoId: song.videoId, ...classification, desc });
      } catch (e) {
        console.warn(`  ⚠️ AI error for ${song.videoId}: ${e.message}`);
        results.push({ videoId: song.videoId, eventTag: 'None', category: 'Other', reason: '', topComments: '', desc: '' });
      }
      // Throttle Gemini API calls to prevent 429 rate limit exceeded
      await new Promise(r => setTimeout(r, 200));
    }

    // 2. Bulk BigQuery MERGE
    const valuesSql = results.map((r, j) => 
      `SELECT @vId${j} as vId, @tag${j} as eTag, @cat${j} as cTag, @desc${j} as description, @comments${j} as topComments, @reason${j} as analyzedReason`
    ).join('\n      UNION ALL ');

    const params = {};
    results.forEach((r, j) => {
      params[`vId${j}`] = r.videoId;
      params[`tag${j}`] = r.eventTag || 'None';
      params[`cat${j}`] = r.category || 'Other';
      params[`desc${j}`] = r.desc || '';
      params[`comments${j}`] = r.topComments || '';
      params[`reason${j}`] = r.reason || '';
    });

    const mergeSql = `
      MERGE \`heat_ranking.songs_master\` T
      USING (
        ${valuesSql}
      ) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          eventTag = IF(S.eTag = 'None' AND T.eventTag IS NOT NULL AND T.eventTag != 'None', T.eventTag, S.eTag),
          category = IF(S.cTag = 'Other' AND T.category IS NOT NULL AND T.category != 'Other', T.category, S.cTag),
          description = IF(S.description != '', S.description, T.description),
          topComments = S.topComments,
          analyzedReason = IF(S.analyzedReason != '', S.analyzedReason, T.analyzedReason),
          classificationSource = 'AI'
    `;

    // Retry logic for the MERGE statement (less likely to fail than 1-by-1)
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await bq.query({ query: mergeSql, params });
        success = true;
        break;
      } catch (e) {
        console.warn(`  ⚠️ MERGE attempt ${attempt} failed: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (success) {
      console.log(`  ✅ ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} 完了 (${Math.round(Math.min(i + BATCH_SIZE, rows.length)/rows.length*100)}%)`);
    } else {
      console.error(`  ❌ Failed to save batch ${i/BATCH_SIZE + 1}`);
      process.exit(1);
    }

    // Optional: Small sleep to be kind to the API (50 per batch)
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('--- Batch Labeling System (High-Speed) Completed ---');
}

runBatchLabeling().catch(err => {
  console.error('Fatal Pipeline Error:', err);
  process.exit(1);
});
