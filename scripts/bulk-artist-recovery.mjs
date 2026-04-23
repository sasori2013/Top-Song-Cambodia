import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';
const DAILY_LIMIT = process.argv[2] ? parseInt(process.argv[2]) : 50; // Default to small test batch

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

async function runRecovery() {
  console.log(`--- Deep Artist Recovery Started (Limit: ${DAILY_LIMIT}) ---`);

  // 1. Fetch stubborn songs
  const query = `
    SELECT videoId, title, artist, description
    FROM \`${DATASET_ID}.songs_master\`
    WHERE (
      LOWER(artist) LIKE '%production%' 
      OR LOWER(artist) LIKE '%rasmey%' 
      OR LOWER(artist) LIKE '%town%'
      OR LOWER(artist) LIKE '%sunday%'
      OR LOWER(artist) LIKE '%galaxy%'
      OR LOWER(artist) LIKE '%klap%'
    )
    AND (detectedArtist IS NULL OR detectedArtist = '')
    ORDER BY publishedAt DESC
    LIMIT ${DAILY_LIMIT}
  `;

  const [songs] = await bq.query(query);
  if (songs.length === 0) {
    console.log('No stubborn songs found.');
    return;
  }

  console.log(`Analyzing ${songs.length} songs...`);

  const fixes = [];
  for (const song of songs) {
    const { videoId, title, artist, description } = song;
    const cleanDesc = (description || '').substring(0, 1000);

    const prompt = `
Context: Analyze a Cambodian music video.
Production/Channel: "${artist}"
Title: "${title}"
Description: "${cleanDesc}"

TASK: Identify the PRIMARY SINGER(S). 
RULES:
1. Look closely at the title and description. 
2. Look for names in hashtags (e.g. #តន់ចន្ទសីម៉ា, #TonChanseyma).
3. If it's a duet/collaboration, include all (e.g. "Singer A & Singer B").
4. If you absolutely cannot find a singer name, return "Unknown".
5. If you are going to return the production name (e.g. "${artist}", "Town", "Galaxy"), return "Unknown".
6. Return ONLY the name(s) in plain text. NO explanation. NO JSON.
`;

    try {
      const result = await callGemini(prompt);
      const fixedName = result.trim().replace(/^["\s]+|["\s]+$/g, '');

      if (fixedName && fixedName !== 'Unknown' && fixedName !== artist && fixedName.length > 2) {
        fixes.push({ videoId, fixedArtist: fixedName });
        console.log(`  ✅ [${artist}] -> "${fixedName}" | ${title.substring(0, 40)}...`);
      } else {
        console.log(`  ⏭️  Skipped: ${title.substring(0, 40)}...`);
      }
    } catch (err) {
      console.warn(`  ⚠️ AI error for ${videoId}: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 200)); // Rate limit
  }

  if (fixes.length === 0) {
    console.log('No new artist names recovered.');
    return;
  }

  // 2. Update BigQuery
  console.log(`Updating ${fixes.length} records in BigQuery...`);
  const BATCH = 50;
  for (let i = 0; i < fixes.length; i += BATCH) {
    const chunk = fixes.slice(i, i + BATCH);
    const valuesSql = chunk.map((_, j) => `SELECT @vId${j} as vId, @artist${j} as newArtist`).join('\n      UNION ALL ');
    const params = {};
    chunk.forEach((r, j) => {
      params[`vId${j}`] = r.videoId;
      params[`artist${j}`] = r.fixedArtist;
    });

    const mergeSql = `
      MERGE \`${DATASET_ID}.songs_master\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          artist = S.newArtist,
          detectedArtist = S.newArtist,
          classificationSource = 'ARTIST_RECOVERED'
    `;
    await bq.query({ query: mergeSql, params });
  }

  console.log('--- Recovery Batch Complete ---');
}

runRecovery().catch(console.error);
