/**
 * batch-genre-classify.mjs
 *
 * Backfills `genre` for songs in songs_master using stored topComments + Gemini.
 * No YouTube API calls needed — topComments already stored in BQ.
 *
 * Usage:
 *   node scripts/batch-genre-classify.mjs                  # dry run, ranking songs only
 *   node scripts/batch-genre-classify.mjs --write          # write to BQ + sync SONGS sheet
 *   node scripts/batch-genre-classify.mjs --write --all    # all songs (not just ranking)
 *   node scripts/batch-genre-classify.mjs --write --limit=100
 *   node scripts/batch-genre-classify.mjs --write --rerun  # re-classify already-classified songs too
 */

import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID  = process.env.GCP_PROJECT_ID;
const SHEET_ID    = process.env.NEXT_PUBLIC_SHEET_ID;
const LOCATION    = 'us-central1';
const DATASET_ID  = 'heat_ranking';
const BATCH_SIZE  = 15;    // 小バッチ → トークン消費を抑える
const DELAY_MS    = 2500;  // 24 req/min → 60 RPM 制限の 40% で余裕を持つ
const MAX_RETRIES = 4;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq     = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth   = new GoogleAuth({ credentials, scopes: 'https://www.googleapis.com/auth/cloud-platform' });
const gauth  = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth: gauth });

const GEMINI_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;
const GENRES = ['Pop', 'Hip-hop & Rap', 'R&B & Soul', 'Ballad', 'Traditional Khmer', 'Dance & EDM', 'Rock', 'Other'];

const args     = process.argv.slice(2);
const DO_WRITE = args.includes('--write');
const DO_ALL   = args.includes('--all');
const DO_RERUN = args.includes('--rerun');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1]) : (DO_ALL ? Infinity : Infinity);
const monthArg  = args.find(a => a.startsWith('--month='));
const MONTH     = monthArg ? monthArg.split('=')[1] : null; // e.g. "2026-04"
const artistArg = args.find(a => a.startsWith('--artist='));
const ARTIST    = artistArg ? artistArg.split('=')[1] : null; // e.g. "Sophia Kao"

// ── Gemini (with retry + exponential backoff) ─────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGemini(songs, token) {
  const songList = songs.map((s, i) =>
    `[${i}] Artist: ${s.artist}\nTitle: ${s.title}\nEventTag: ${s.eventTag || 'None'}\nComments: ${(s.topComments || '').substring(0, 350)}`
  ).join('\n\n');

  const prompt = `You are classifying Cambodian music songs by genre.
Judge the genre of the SONG ITSELF, not the artist's usual style.

Genres (pick exactly one): ${GENRES.join(' / ')}

Key rules:
- "Khmer New Year" eventTag: DEFAULT to Traditional Khmer UNLESS the song is clearly modern (rap/hip-hop beat, English-heavy lyrics, EDM production). When in doubt, choose Traditional Khmer.
- Titles containing រាំ (dance), ក្រមុំ (Khmer girl), ឆ្នាំថ្មី (New Year), ចូលឆ្នាំ (enter New Year), រាំវង់, or similar Khmer New Year vocabulary → Traditional Khmer.
- "Cambodian Idol" / "The Voice Cambodia": usually Ballad or R&B & Soul.
- Comments mentioning ចម្រៀងបុរាណ / រាំវង់ / ល្ខោន / traditional dance → Traditional Khmer.

Songs:
${songList}

Return ONLY a compact JSON array with exactly ${songs.length} objects, no extra text:
[{"videoId":"...","genre":"..."},...]`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    // Rate limit → wait and retry
    if (res.status === 429 || res.status === 503) {
      const wait = DELAY_MS * Math.pow(2, attempt); // 5s, 10s, 20s, 40s
      process.stdout.write(`\n  ⚠ ${res.status} rate limit — ${Math.round(wait/1000)}s 待機中...`);
      await sleep(wait);
      continue;
    }

    const data = await res.json();
    if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json|```/g, '').trim();

    const results = JSON.parse(text);
    return results.map((r, i) => ({
      videoId: songs[i].videoId,
      genre:   GENRES.includes(r.genre) ? r.genre : 'Other',
    }));
  }
  throw new Error(`Max retries (${MAX_RETRIES}) exceeded`);
}

// ── BQ bulk update ─────────────────────────────────────────────────────────────

async function bulkUpdateBQ(results) {
  // Chunk into 200-row UPDATE CASE WHEN statements
  const CHUNK = 200;
  for (let i = 0; i < results.length; i += CHUNK) {
    const chunk = results.slice(i, i + CHUNK);
    const cases = chunk.map(r => `WHEN '${r.videoId}' THEN '${r.genre.replace(/'/g, "\\'")}'`).join('\n      ');
    const ids   = chunk.map(r => `'${r.videoId}'`).join(',');
    await bq.query(`
      UPDATE \`${DATASET_ID}.songs_master\`
      SET genre = CASE videoId
        ${cases}
      END
      WHERE videoId IN (${ids})
    `);
  }
}

// ── SONGS sheet full sync ──────────────────────────────────────────────────────
// Columns: A=videoId B=artist C=title D=cleanTitle E=publishedAt
//          F=eventTag G=category H=detectedArtist I=featuring J=url K=heatId L=genre

async function syncSongsSheet() {
  console.log('\n  Sheets: SONGSシートを同期中...');

  const [rows] = await bq.query(`
    SELECT videoId, artist, title, cleanTitle, publishedAt,
           eventTag, category, detectedArtist, featuring, genre
    FROM \`${DATASET_ID}.songs_master\`
    ORDER BY publishedAt DESC
  `);

  const header = ['videoId','artist','title','Clean Title','publishedAt','Event Tag','Category','DetectedArtist','Featuring','Link','heatId','genre'];

  const heatId = (vid) => `KH-${vid.substring(0,10).toUpperCase()}`;

  const rowData = rows.map(r => {
    let pub = r.publishedAt;
    if (pub && typeof pub === 'object' && pub.value) pub = pub.value;
    if (pub instanceof Date) pub = pub.toISOString().split('.')[0].replace('T',' ')+'Z';
    else if (typeof pub === 'string' && pub.includes('.')) pub = pub.split('.')[0].replace('T',' ')+'Z';
    return [
      String(r.videoId || ''),
      String(r.artist || ''),
      String(r.title || ''),
      String(r.cleanTitle || ''),
      String(pub || ''),
      String(r.eventTag || ''),
      String(r.category || ''),
      String(r.detectedArtist || ''),
      String(r.featuring || ''),
      `https://www.youtube.com/watch?v=${r.videoId}`,
      heatId(r.videoId || ''),
      String(r.genre || ''),
    ];
  });

  const allData = [header, ...rowData];

  // Expand grid if needed
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const songsSheet = meta.data.sheets.find(s => s.properties.title === 'SONGS');
  if (songsSheet && songsSheet.properties.gridProperties.rowCount < allData.length + 100) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{
        updateSheetProperties: {
          properties: { sheetId: songsSheet.properties.sheetId, gridProperties: { rowCount: allData.length + 500 } },
          fields: 'gridProperties.rowCount'
        }
      }]}
    });
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'SONGS!A:L' });

  const CHUNK = 1000;
  for (let i = 0; i < allData.length; i += CHUNK) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `SONGS!A${i + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: allData.slice(i, i + CHUNK) },
    });
  }

  // Sort by publishedAt DESC (column E, index 4)
  if (songsSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{
        sortRange: {
          range: { sheetId: songsSheet.properties.sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
          sortSpecs: [{ dimensionIndex: 4, sortOrder: 'DESCENDING' }]
        }
      }]}
    });
  }

  console.log(`  Sheets: SONGS ${rowData.length} 行を書き込み完了 (genre 列 L 追加)`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== batch-genre-classify (${DO_WRITE ? 'WRITE' : 'DRY RUN'}, scope=${DO_ALL ? 'ALL' : 'ranking only'}${MONTH ? `, month=${MONTH}` : ''}) ===\n`);

  // 1. genre カラムを確実に存在させる
  await bq.query(`ALTER TABLE \`${DATASET_ID}.songs_master\` ADD COLUMN IF NOT EXISTS genre STRING`);

  // 2. 対象曲を取得
  const genreFilter = DO_RERUN ? '' : `AND (sm.genre IS NULL OR sm.genre = '')`;
  const scopeFilter = DO_ALL
    ? ''
    : `AND sm.videoId IN (SELECT DISTINCT videoId FROM \`${DATASET_ID}.rank_history\` WHERE type = 'DAILY')`;
  const monthFilter  = MONTH  ? `AND FORMAT_DATE('%Y-%m', DATE(sm.publishedAt)) = '${MONTH}'` : '';
  const artistFilter = ARTIST ? `AND LOWER(sm.artist) LIKE LOWER('%${ARTIST}%')` : '';
  const limitClause = Number.isFinite(LIMIT) ? `LIMIT ${LIMIT}` : '';

  const [songs] = await bq.query(`
    SELECT sm.videoId, sm.artist, sm.title, sm.eventTag, sm.topComments
    FROM \`${DATASET_ID}.songs_master\` sm
    WHERE sm.topComments IS NOT NULL
      AND sm.topComments NOT IN ('', 'No comments available.', 'Error fetching')
      ${genreFilter}
      ${scopeFilter}
      ${monthFilter}
      ${artistFilter}
    ORDER BY sm.publishedAt DESC
    ${limitClause}
  `);

  if (songs.length === 0) {
    console.log('✅ 対象曲なし（すべてジャンル設定済み）');
    if (DO_WRITE) await syncSongsSheet();
    return;
  }

  const batches  = Math.ceil(songs.length / BATCH_SIZE);
  const perBatch = (DELAY_MS + 3500) / 1000; // avg seconds per batch
  const estMin   = Math.round(batches * perBatch / 60);
  console.log(`対象: ${songs.length} 曲 / ${batches} バッチ / 推定 ${estMin} 分`);
  console.log(`レート: ${BATCH_SIZE} 曲/リクエスト, ${DELAY_MS}ms 間隔 (~${Math.round(60000/DELAY_MS)} req/min)\n`);

  const client   = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  let   token    = tokenRes.token;
  let   tokenRefreshedAt = Date.now();

  const allResults = [];
  let errors = 0;
  let startTime = Date.now();

  for (let i = 0; i < songs.length; i += BATCH_SIZE) {
    const batch     = songs.slice(i, i + BATCH_SIZE);
    const done      = i + batch.length;
    const pct       = Math.round((done / songs.length) * 100);
    const elapsed   = (Date.now() - startTime) / 1000;
    const speed     = done / elapsed; // songs per second
    const remaining = Math.round((songs.length - done) / speed / 60);
    process.stdout.write(`  [${pct}%] ${done}/${songs.length} 曲 | 残り約${remaining}分\r`);

    // アクセストークンを 50 分ごとに更新
    if (Date.now() - tokenRefreshedAt > 50 * 60 * 1000) {
      const newToken = await client.getAccessToken();
      token = newToken.token;
      tokenRefreshedAt = Date.now();
    }

    try {
      const results = await callGemini(batch, token);
      allResults.push(...results);

      if (!DO_WRITE) {
        results.forEach(r => console.log(`  [DRY] ${r.genre.padEnd(22)} ${r.videoId}`));
      }
    } catch (e) {
      console.warn(`\n  バッチ ${i} エラー: ${e.message}`);
      errors++;
    }

    if (i + BATCH_SIZE < songs.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n\nGemini完了: ${allResults.length} 曲 / エラー: ${errors} バッチ`);

  if (DO_WRITE && allResults.length > 0) {
    console.log('  BQ更新中...');
    await bulkUpdateBQ(allResults);
    console.log(`  BQ: ${allResults.length} 曲の genre を更新`);

    await syncSongsSheet();
  }

  if (!DO_WRITE) {
    const dist = {};
    allResults.forEach(r => dist[r.genre] = (dist[r.genre] || 0) + 1);
    console.log('\nジャンル分布プレビュー:');
    Object.entries(dist).sort((a,b) => b[1]-a[1]).forEach(([g,n]) => console.log(`  ${g.padEnd(20)} ${n}`));
    console.log('\n--write を付けると BQ + SONGS シートに書き込みます');
  }
}

main().catch(console.error);
