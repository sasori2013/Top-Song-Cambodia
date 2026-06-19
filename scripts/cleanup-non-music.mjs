import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_master';

const DO_DELETE = process.argv.includes('--delete');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 20;
const OFFSET_ARG = process.argv.find(a => a.startsWith('--offset='));
const OFFSET = OFFSET_ARG ? parseInt(OFFSET_ARG.split('=')[1]) : 0;
const CONCURRENCY_ARG = process.argv.find(a => a.startsWith('--concurrency='));
const CONCURRENCY = CONCURRENCY_ARG ? parseInt(CONCURRENCY_ARG.split('=')[1]) : 5;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const sheetsAuth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
const vertexAuth = new GoogleAuth({ credentials, scopes: 'https://www.googleapis.com/auth/cloud-platform' });

const SUSPICIOUS_KEYWORDS = [
  'vlog', 'eating', 'buffet', 'food', 'live stream', 'stream', 'gaming', 'review', 'news', 'reaction', 'interview', 'bts', 'behind the scenes',
  'ញុំា', 'ប៊ូហ្វេ', 'ម្ហូប', 'ផ្សាយផ្ទាល់', 'លេងហ្គេម', 'ព័ត៌មាន', 'សម្ភាសន៍', 'កំប្លែង'
];

async function callGemini(videoId, title, description, token, retries = 3) {
  const prompt = `
Analyze if the following YouTube video is a "Song/Music Content" or "Non-Music Content" (Vlog, Food Review, News, Gaming, BTS, etc.).

VIDEO INFO:
Title: ${title}
Description: ${description}

RULES:
1. "Song/Music Content" includes: Official MV, Lyric Video, Audio, Live Performance, Concert, Dance Motion, Cover Song.
2. "Non-Music Content" includes: Vlogs, Daily Life, Eating/Food reviews, Gaming, Interviews (without singing), News, Behind the scenes (unless it's a long making-of with music focus), Reactions.
3. If unsure but it features a music artist just talking/vlogging, it is "Non-Music Content".

Output only a valid JSON object:
{
  "isMusic": true or false,
  "reason": "Brief explanation in English"
}
`;

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      if (attempt === retries) throw new Error(`Gemini API error: 429 (exhausted retries)`);
      const wait = (attempt + 1) * 8000;
      process.stdout.write(`[429 retry in ${wait/1000}s] `);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  }
}

async function main() {
  console.log(`\n=== cleanup-non-music (${DO_DELETE ? 'DELETE' : 'DRY RUN'}) ===\n`);

  // 1. Fetch suspicious candidates from BigQuery
  // Focus on 'Other' category or keyword matches
  const keywordFilter = SUSPICIOUS_KEYWORDS.map(kw => `LOWER(title) LIKE '%${kw.toLowerCase()}%' OR LOWER(description) LIKE '%${kw.toLowerCase()}%'`).join(' OR ');
  const query = `
    SELECT videoId, title, description, artist, category
    FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    WHERE (category = 'Other' OR ${keywordFilter})
    ORDER BY last_updated_at DESC
    LIMIT ${LIMIT}
    OFFSET ${OFFSET}
  `;

  const [rows] = await bq.query(query);
  console.log(`Candidates found: ${rows.length}`);

  if (rows.length === 0) {
    console.log('No candidates found.');
    return;
  }

  // 2. Get Vertex AI token
  const client = await vertexAuth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  // 3. Classify with Gemini (parallel with concurrency limit)
  console.log(`Concurrency: ${CONCURRENCY}`);
  const nonMusicVideos = [];
  const queue = [...rows];

  await new Promise((resolve) => {
    let active = 0;
    function next() {
      while (active < CONCURRENCY && queue.length > 0) {
        const row = queue.shift();
        active++;
        process.stdout.write(`  Analyzing ${row.videoId}... `);
        callGemini(row.videoId, row.title, row.description || '', token)
          .then(result => {
            if (!result.isMusic) {
              console.log(`[NON-MUSIC] - ${result.reason}`);
              nonMusicVideos.push({ ...row, reason: result.reason });
            } else {
              console.log(`[MUSIC]`);
            }
          })
          .catch(e => console.log(`[ERROR] ${e.message}`))
          .finally(() => {
            active--;
            if (queue.length > 0) next();
            else if (active === 0) resolve();
          });
      }
    }
    next();
  });

  console.log(`\n--- Identification Result (${nonMusicVideos.length}/${rows.length}) ---`);
  nonMusicVideos.forEach(v => {
    console.log(`  - [${v.artist}] ${v.title} (${v.videoId})`);
    console.log(`    Reason: ${v.reason}`);
  });

  if (nonMusicVideos.length === 0) {
    console.log('\nNo non-music videos identified.');
    return;
  }

  if (!DO_DELETE) {
    console.log(`\n[DRY RUN] No changes made. Run with --delete to remove these ${nonMusicVideos.length} videos.`);
    return;
  }

  // 4. Delete from BigQuery
  const videoIds = nonMusicVideos.map(v => v.videoId);
  console.log(`\n[DELETE] Removing from BigQuery...`);
  await bq.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` WHERE videoId IN UNNEST(@ids)`,
    params: { ids: videoIds }
  });
  console.log('  BigQuery cleanup completed.');

  // 5. Delete from Google Sheets (SONGS and SONGS_LONG)
  const targetSheets = ['SONGS', 'SONGS_LONG'];
  for (const sheetName of targetSheets) {
    console.log(`[DELETE] Checking sheet: ${sheetName}...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A:A` });
    const sheetRows = res.data.values || [];
    const toDeleteIndices = []; // 0-based

    for (let i = 1; i < sheetRows.length; i++) {
      const vId = (sheetRows[i][0] || '').trim();
      if (videoIds.includes(vId)) {
        toDeleteIndices.push(i);
      }
    }

    if (toDeleteIndices.length > 0) {
      console.log(`  Found ${toDeleteIndices.length} rows to delete in ${sheetName}.`);
      
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
      if (!sheetMeta) continue;
      const sheetGid = sheetMeta.properties.sheetId;

      const requests = toDeleteIndices
        .sort((a, b) => b - a)
        .map(idx => ({
          deleteDimension: {
            range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }
          }
        }));

      // Batch delete
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests }
      });
      console.log(`  Deleted ${toDeleteIndices.length} rows from ${sheetName}.`);
    } else {
      console.log(`  No matching rows in ${sheetName}.`);
    }
  }

  console.log('\n[DELETE] All cleanups completed.');
}

main().catch(console.error);
