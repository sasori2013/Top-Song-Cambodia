/**
 * batch-sentiment.mjs
 * Analyze positive/negative/neutral sentiment of stored topComments via Gemini.
 *
 * Usage:
 *   node scripts/batch-sentiment.mjs              # dry run (ranking songs only)
 *   node scripts/batch-sentiment.mjs --write      # write to BQ
 *   node scripts/batch-sentiment.mjs --write --all  # all songs
 *   node scripts/batch-sentiment.mjs --write --rerun # re-analyze already done
 */

import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION   = 'us-central1';
const DATASET_ID = 'heat_ranking';
const BATCH_SIZE = 10;
const DELAY_MS   = 2500;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq   = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new GoogleAuth({ credentials, scopes: 'https://www.googleapis.com/auth/cloud-platform' });

const GEMINI_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;

const args     = process.argv.slice(2);
const DO_WRITE = args.includes('--write');
const DO_ALL   = args.includes('--all');
const DO_RERUN = args.includes('--rerun');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGemini(songs, token) {
  const songList = songs.map((s, i) =>
    `[${i}] Title: ${s.title}\nArtist: ${s.artist}\nComments:\n${(s.topComments || '').substring(0, 600)}`
  ).join('\n\n---\n\n');

  const prompt = `Analyze the sentiment of YouTube comments for each Cambodian music song below.
Comments may be in Khmer, English, or mixed. Emojis count as sentiment signals (❤️😍 = positive, 😢😡 = negative).

For each song, return:
- positive: % of comments that are positive/appreciative/loving (0-100)
- negative: % of comments that are negative/critical/hateful (0-100)
- neutral: remaining % (neutral/informational/spam)

Songs:
${songList}

Return ONLY a compact JSON array with exactly ${songs.length} objects:
[{"videoId":"...","positive":80,"negative":5,"neutral":15},...]`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (res.status === 429 || res.status === 503) {
      await sleep(DELAY_MS * Math.pow(2, attempt));
      continue;
    }
    const data = await res.json();
    if (data.error) throw new Error(`Gemini: ${data.error.message}`);
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  }
  throw new Error('Max retries exceeded');
}

async function main() {
  console.log(`\n=== batch-sentiment (${DO_WRITE ? 'WRITE' : 'DRY RUN'}, scope=${DO_ALL ? 'ALL' : 'ranking only'}) ===\n`);

  const sentimentFilter = DO_RERUN ? '' : `AND (sm.sentiment_positive IS NULL)`;
  const scopeFilter = DO_ALL
    ? ''
    : `AND sm.videoId IN (SELECT DISTINCT videoId FROM \`${DATASET_ID}.rank_history\` WHERE type = 'DAILY')`;

  const [songs] = await bq.query(`
    SELECT sm.videoId, sm.artist, sm.title, sm.topComments
    FROM \`${DATASET_ID}.songs_master\` sm
    WHERE sm.topComments IS NOT NULL
      AND sm.topComments NOT IN ('', 'No comments available.', 'Error fetching')
      ${sentimentFilter}
      ${scopeFilter}
    ORDER BY sm.last_updated_at DESC
  `);

  if (songs.length === 0) {
    console.log('✅ 対象曲なし（すべて分析済み）');
    return;
  }

  const batches = Math.ceil(songs.length / BATCH_SIZE);
  console.log(`対象: ${songs.length} 曲 / ${batches} バッチ\n`);

  const client   = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  let token      = tokenRes.token;
  let tokenAt    = Date.now();

  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < songs.length; i += BATCH_SIZE) {
    const batch = songs.slice(i, i + BATCH_SIZE);
    const done  = i + batch.length;
    const pct   = Math.round((done / songs.length) * 100);
    process.stdout.write(`  [${pct}%] ${done}/${songs.length} 曲`);

    // Refresh token every 45 min
    if (Date.now() - tokenAt > 45 * 60 * 1000) {
      token   = (await (await auth.getClient()).getAccessToken()).token;
      tokenAt = Date.now();
    }

    try {
      const results = await callGemini(batch, token);
      if (DO_WRITE && results.length > 0) {
        // Always use batch order (idMap) — never trust Gemini's videoId field
        const updates = results.map((r, idx) => {
          const videoId = batch[idx].videoId;
          return bq.query(`
            UPDATE \`${DATASET_ID}.songs_master\`
            SET sentiment_positive = ${Math.round(r.positive ?? 0)},
                sentiment_negative = ${Math.round(r.negative ?? 0)},
                sentiment_neutral  = ${Math.round(r.neutral  ?? 0)}
            WHERE videoId = '${videoId}'
          `);
        });
        await Promise.all(updates);
        process.stdout.write(` ✓\n`);
      } else {
        process.stdout.write(` (dry)\n`);
        results.slice(0, 2).forEach(r => console.log('   ', JSON.stringify(r)));
      }
    } catch (e) {
      errors++;
      process.stdout.write(` ✗ ${e.message}\n`);
    }

    if (i + BATCH_SIZE < songs.length) await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n完了: ${songs.length} 曲 / エラー: ${errors} バッチ / ${elapsed}s`);
}

main().catch(console.error);
