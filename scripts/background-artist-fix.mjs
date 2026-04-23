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

const DAILY_LIMIT = 300;

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

async function getRoster() {
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, '');
  const credentials = JSON.parse(jsonStr);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
    range: 'Label_Roster!A:C'
  });
  const rows = res.data.values || [];
  const map = new Map();
  // Skip header
  rows.slice(1).forEach(r => {
    const [labelName, targetArtist, keywordsStr] = r;
    if (!labelName || !targetArtist) return;
    if (!map.has(labelName)) map.set(labelName, []);
    const keywords = (keywordsStr || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k);
    map.get(labelName).push({ targetArtist, keywords });
  });
  return map;
}

async function runArtistFix() {
  console.log('--- Background Artist Fix Started (Roster-Aware) ---');
  const rosterMap = await getRoster();
  console.log(`Loaded ${rosterMap.size} production labels from roster.`);

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
      OR LOWER(detectedArtist) IN ('rhm', 'town', 'sunday', 'galaxy', 'ream', 'cg')
    )
    AND classificationSource != 'ARTIST_FIXED'
    ORDER BY publishedAt DESC
    LIMIT ${DAILY_LIMIT}
  `);

  if (songs.length === 0) {
    console.log('No songs with label artist names found today.');
    return;
  }

  console.log(`Analyzing ${songs.length} candidates...`);
  await sendTelegramNotification(`🎤 <b>アーティスト名修正 (Roster優先) 開始</b>\n対象: ${songs.length}件`);

  const fixes = [];
  for (const song of songs) {
    const { videoId, title, artist, description } = song;
    let fixedName = null;

    // A. Check Roster First (Manual Rule Wins)
    if (rosterMap.has(artist)) {
      const titleLower = title.toLowerCase();
      for (const rule of rosterMap.get(artist)) {
        if (rule.keywords.some(kw => titleLower.includes(kw))) {
          fixedName = rule.targetArtist;
          console.log(`  📍 Roster Match: "${title.substring(0, 30)}..." -> ${fixedName}`);
          break;
        }
      }
    }

    // B. If no roster match, call Gemini (AI fallback)
    if (!fixedName && (description || '').length > 10) {
      const cleanDesc = (description || '').substring(0, 600);
      const prompt = `
You are analyzing a Cambodian music video.
Production: "${artist}"
Title: "${title}"
Description: "${cleanDesc}"

Extract the REAL singer name.
Rules:
- If singer is found, return ONLY the name.
- If it is a compilation, return "Various Artists".
- If you return the Label name/acronym (e.g. "${artist}", "RHM", "Town"), return exactly "SKIP".
- NO explanation.
`;

      try {
        const result = await callGemini(prompt);
        const aiName = result.trim().replace(/^["\s]+|["\s]+$/g, '');
        if (aiName && aiName !== 'SKIP' && aiName.length > 1 && aiName.length < 100) {
          fixedName = aiName;
          console.log(`  🤖 AI Guess: "${title.substring(0, 30)}..." -> ${fixedName}`);
        }
      } catch (err) {
        console.warn(`  ⚠️ AI error for ${videoId}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    }

    if (fixedName && fixedName !== artist) {
      fixes.push({ videoId, fixedArtist: fixedName });
    }
  }

  if (fixes.length === 0) {
    console.log('No fixes found.');
    return;
  }

  // 2. Update BigQuery: both artist and detectedArtist
  const BATCH = 100;
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
          artist = IF(T.artist LIKE '%Production%' OR T.artist LIKE '%Rasmey%' OR T.artist LIKE '%Town%', S.newArtist, T.artist),
          detectedArtist = S.newArtist,
          classificationSource = 'ARTIST_FIXED'
    `;
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
