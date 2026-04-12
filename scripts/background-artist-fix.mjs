import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';

// Label/Production company keywords to detect
const LABEL_KEYWORDS = [
  'production', 'records', 'music', 'entertainment', 'official',
  'studio', 'media', 'channel', 'label', 'company',
  'rasmey', 'town', 'sunday', 'galaxy', 'ream', 'cg movement',
];

const DAILY_LIMIT = 200;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const googleAuth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

function isLikelyLabelName(artistName) {
  if (!artistName) return false;
  const lower = artistName.toLowerCase();
  return LABEL_KEYWORDS.some(kw => lower.includes(kw));
}

async function callGemini(prompt) {
  const client = await googleAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return text.replace(/```json|```/g, '').trim();
}

async function runArtistFix() {
  console.log('--- Background Artist Fix Started ---');

  // 1. Find songs where artist is likely a label name
  const [songs] = await bq.query(`
    SELECT videoId, title, artist, description
    FROM \`${DATASET_ID}.songs_master\`
    WHERE (
      LOWER(artist) LIKE '%production%'
      OR LOWER(artist) LIKE '%records%'
      OR LOWER(artist) LIKE '%entertainment%'
      OR LOWER(artist) LIKE '%studio%'
      OR LOWER(artist) LIKE '%rasmey%'
      OR LOWER(artist) LIKE '%town%'
      OR LOWER(artist) LIKE '%sunday%'
      OR LOWER(artist) LIKE '%galaxy%'
      OR LOWER(artist) LIKE '%ream%'
    )
    AND classificationSource != 'ARTIST_FIXED'
    AND (description IS NOT NULL AND description != '')
    ORDER BY publishedAt DESC
    LIMIT ${DAILY_LIMIT}
  `);

  if (songs.length === 0) {
    console.log('No songs with label artist names found today.');
    return;
  }

  console.log(`Found ${songs.length} songs with potential label artist names.`);
  await sendTelegramNotification(`🎤 <b>アーティスト名修正 開始</b>\n対象: ${songs.length}件`);

  const fixes = [];
  for (const song of songs) {
    const { videoId, title, artist, description } = song;
    const cleanDesc = (description || '').substring(0, 600);

    const prompt = `
You are analyzing a Cambodian music video.
The current "artist" field is "${artist}" which appears to be a music label or production company, NOT the actual singer.

Video Title: "${title}"
Description (first 600 chars): "${cleanDesc}"

Task: Extract the REAL singer/artist name from the title and description.
- If the actual singer name is clearly mentioned, return it.
- If the video is a compilation or playlist with multiple artists, return "Various Artists".
- If you cannot determine the real artist, return the original label name unchanged: "${artist}".

Rules:
- Return ONLY the artist name as a plain string, NO JSON, NO explanation.
- Common patterns: "ចម្រៀង [Artist Name]", "[Artist Name] - [Title]", "by [Artist Name]"
- Keep the name as it appears (Khmer script or Latin OK).
`;

    try {
      const result = await callGemini(prompt);
      const fixedName = result.trim().replace(/^["\s]+|["\s]+$/g, '');

      if (fixedName && fixedName !== artist && fixedName.length > 1 && fixedName.length < 100) {
        fixes.push({ videoId, originalArtist: artist, fixedArtist: fixedName });
        console.log(`  ✅ "${artist}" → "${fixedName}" (${title.substring(0, 40)}...)`);
      } else {
        console.log(`  ⏭️  Skipped (no better name found): ${title.substring(0, 40)}...`);
      }
    } catch (err) {
      console.warn(`  ⚠️ AI error for ${videoId}: ${err.message}`);
    }

    // Rate limit Gemini: 200 calls/min is default, 300ms is safe
    await new Promise(r => setTimeout(r, 300));
  }

  if (fixes.length === 0) {
    console.log('No artist names to update today.');
    await sendTelegramNotification(`ℹ️ <b>アーティスト名修正</b>: 本日は更新なし`);
    return;
  }

  // 2. Update BigQuery: fix artist names and mark as ARTIST_FIXED
  console.log(`Updating ${fixes.length} artist names in BigQuery...`);

  const BATCH = 100;
  let fixedCount = 0;

  for (let i = 0; i < fixes.length; i += BATCH) {
    const chunk = fixes.slice(i, i + BATCH);

    const valuesSql = chunk.map((_, j) =>
      `SELECT @vId${i+j} as vId, @artist${i+j} as newArtist`
    ).join('\n      UNION ALL ');

    const params = {};
    chunk.forEach((r, j) => {
      params[`vId${i+j}`] = r.videoId;
      params[`artist${i+j}`] = r.fixedArtist;
    });

    const mergeSql = `
      MERGE \`${DATASET_ID}.songs_master\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET artist = S.newArtist, classificationSource = 'ARTIST_FIXED'
    `;

    try {
      await bq.query({ query: mergeSql, params });
      fixedCount += chunk.length;
    } catch (e) {
      console.error(`  ❌ Update failed: ${e.message}`);
    }
  }

  // 3. Delete stale vectors for fixed songs (so they re-vectorize with correct artist name)
  const fixedVideoIds = fixes.map(f => f.videoId);
  if (fixedVideoIds.length > 0) {
    try {
      await bq.query({
        query: `DELETE FROM \`${DATASET_ID}.songs_vector\` WHERE videoId IN UNNEST(@ids)`,
        params: { ids: fixedVideoIds }
      });
      console.log(`  🗑️  Cleared ${fixedVideoIds.length} stale vectors for re-vectorization.`);
    } catch (e) {
      console.error(`  ❌ Vector delete failed: ${e.message}`);
    }
  }

  console.log('--- Artist Fix Completed ---');
  await sendTelegramNotification(
    `✅ <b>アーティスト名修正 完了</b>\n` +
    `本日修正: ${fixedCount}件\n` +
    `（修正済み楽曲は翌日に正しい情報で再ベクトル化されます）`
  );
}

runArtistFix().catch(async (error) => {
  console.error('Fatal Error:', error);
  await sendTelegramNotification(`⚠️ <b>アーティスト修正エラー</b>\n<code>${error.message}</code>`);
  process.exit(1);
});
