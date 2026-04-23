/**
 * cleanup-titles-gemini.mjs
 *
 * SONGSシートのC列（YouTube取得タイトル）をGeminiでクリーンアップし
 * D列（cleanTitle）に書き戻す。BigQueryのcleanTitleも同期。
 *
 * Usage:
 *   node scripts/cleanup-titles-gemini.mjs                          # ドライラン（20件プレビュー）
 *   node scripts/cleanup-titles-gemini.mjs --write                  # SONGS + BQ 書き込み（20件）
 *   node scripts/cleanup-titles-gemini.mjs --write --limit=300      # 300件処理
 *   node scripts/cleanup-titles-gemini.mjs --write --all            # D列が空の全行を処理
 *   node scripts/cleanup-titles-gemini.mjs --sheet=SONGS_LONG --write --limit=300
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_WRITE    = process.argv.includes('--write');
const DO_ALL      = process.argv.includes('--all');
const LIMIT_ARG   = process.argv.find(a => a.startsWith('--limit='));
const SHEET_ARG   = process.argv.find(a => a.startsWith('--sheet='));
const TARGET_SHEET = SHEET_ARG ? SHEET_ARG.split('=')[1] : 'SONGS';
const LIMIT = DO_ALL ? Infinity : (LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 20);

const GEMINI_BATCH = 20;    // songs per Gemini call
const GEMINI_DELAY = 1000;  // ms between batches (safe for 60 RPM limit)

const getEnv = (k) => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
const SHEET_ID   = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const LOCATION   = 'us-central1';
const GEMINI_URL = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const cred = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');

const sheetsAuth = new google.auth.GoogleAuth({
  credentials: cred,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const vertexAuth = new GoogleAuth({
  credentials: cred,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});
const bq = new BigQuery({ projectId: PROJECT_ID, credentials: cred });

function stripArtistPrefix(cleanTitle, artistName) {
  if (!cleanTitle || !artistName || artistName.length < 2) return cleanTitle;
  const escaped = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Remove "ArtistName - ", "ArtistName | ", "ArtistName _ ", "ArtistName x ...- " etc. at the start
  const regex = new RegExp(`^${escaped}\\s*(?:[-|:~_]\\s*)`, 'i');
  const stripped = cleanTitle.replace(regex, '').trim();
  // Guard: don't return empty string
  return stripped.length > 0 ? stripped : cleanTitle;
}

async function callGemini(songs, token) {
  const prompt = `You are a Cambodian music expert. Clean these YouTube song titles into professional "Pure Song Titles".

RULES:
1. REMOVE ALL ARTIST/LABEL NAMES: Remove the Singer name and Label name wherever they appear — start, middle, or end — when separated by delimiters ("-", "|", ":", "~", "_"). Use the provided Label and Artist fields to identify them.
   Example: "BROWN - Song Title | RHM" → "Song Title"
   Example: "Song Title | ណុប បាយ៉ារិទ្ធ | OFFICIAL AUDIO | RHM" → "Song Title"
2. PRESERVE COLLABORATIONS: ONLY keep artist names that follow "ft.", "feat.", "x", "&", "featuring". These are part of the song identity and must NOT be removed.
   Example: "KWAN - Song Title ft. ខាត់ សុឃីម" → "Song Title ft. ខាត់ សុឃីម"
3. STRIP METADATA: Remove [Official MV], (Official Audio), (Lyric Video), (MV), (Audio), (Visualizer), "Full Video", "Music Video", "Directed by...". Keep production credits like "(Prod. Artist)" as they are part of the song identity.
4. CLEAN NOISE: Remove emojis, hashtags (#word), trailing delimiters (|, -, _, .).
5. DUAL LANGUAGE: If the title has both Khmer and English as the core song name, preserve both.
6. If the title is already a clean song name with no artist/label noise, return it unchanged.

Input:
${songs.map(s => `ID:${s.videoId} | Label:${s.label} | Artist:${s.artist || 'Unknown'} | Title:${s.title}`).join('\n')}

Return JSON array only: [{"videoId":"...","cleanTitle":"..."}]`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  text = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    console.warn('  JSON parse failed for batch, skipping.');
    return [];
  }
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

  console.log(`\n=== cleanup-titles-gemini (${DO_WRITE ? 'WRITE' : 'DRY RUN'}, sheet=${TARGET_SHEET}, limit=${DO_ALL ? 'ALL' : LIMIT}) ===\n`);

  // Read A:H (A=videoId, B=artist, C=title, D=cleanTitle, H=detectedArtist)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TARGET_SHEET}!A:H`,
  });
  const rows = (res.data.values || []).slice(1); // skip header

  // Target: rows where D (cleanTitle) is empty
  const targets = rows
    .map((r, i) => ({
      rowIndex: i + 2, // 1-based sheet row
      videoId:       (r[0] || '').trim(),
      label:         (r[1] || '').trim(),
      title:         (r[2] || '').trim(),
      cleanTitle:    (r[3] || '').trim(),
      detectedArtist:(r[7] || '').trim(),
    }))
    .filter(r => r.title && !r.cleanTitle)
    .slice(0, LIMIT);

  console.log(`対象（D列が空）: ${targets.length} 曲`);

  if (targets.length === 0) {
    console.log('処理対象なし。');
    return;
  }

  // Vertex AI token
  const client = await vertexAuth.getClient();
  const { token } = await client.getAccessToken();

  // Process in batches
  const allResults = []; // { rowIndex, videoId, cleanTitle }

  for (let i = 0; i < targets.length; i += GEMINI_BATCH) {
    const batch = targets.slice(i, i + GEMINI_BATCH);
    process.stdout.write(`  Gemini処理中... ${i + 1}–${Math.min(i + GEMINI_BATCH, targets.length)}/${targets.length}\r`);

    try {
      const geminiInput = batch.map(r => ({
        videoId: r.videoId,
        label:   r.label,
        artist:  r.detectedArtist || r.label,
        title:   r.title,
      }));
      const results = await callGemini(geminiInput, token);

      for (const result of results) {
        const original = batch.find(b => b.videoId === result.videoId);
        if (original && result.cleanTitle) {
          const cleaned = stripArtistPrefix(result.cleanTitle, original.label);
          allResults.push({
            rowIndex:   original.rowIndex,
            videoId:    original.videoId,
            title:      original.title,
            cleanTitle: cleaned,
          });
        }
      }
    } catch (e) {
      console.warn(`\n  バッチ ${i}–${i + GEMINI_BATCH} エラー: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, GEMINI_DELAY));
  }
  console.log('');

  // Preview
  console.log(`\n--- クリーンアップ結果 (${allResults.length}件) ---`);
  const PREVIEW = 20;
  allResults.slice(0, PREVIEW).forEach(r =>
    console.log(`  Row${r.rowIndex}: "${r.title}"\n       → "${r.cleanTitle}"`)
  );
  if (allResults.length > PREVIEW) {
    console.log(`  ... 他 ${allResults.length - PREVIEW}件`);
  }

  if (!DO_WRITE) {
    console.log(`\n[DRY RUN] 変更なし。--write で書き込み実行。`);
    return;
  }

  // Write to sheet (D column)
  console.log(`\n[WRITE] ${TARGET_SHEET}シートD列を更新中...`);
  const sheetUpdates = allResults.map(r => ({
    range: `${TARGET_SHEET}!D${r.rowIndex}`,
    values: [[r.cleanTitle]],
  }));

  const BATCH = 500;
  for (let i = 0; i < sheetUpdates.length; i += BATCH) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: sheetUpdates.slice(i, i + BATCH),
      },
    });
    process.stdout.write(`  Sheets更新: ${Math.min(i + BATCH, sheetUpdates.length)}/${sheetUpdates.length}\r`);
  }
  console.log(`\n  ${TARGET_SHEET}シート: ${allResults.length}件 更新完了`);

  // Sync to BigQuery
  const bqTargets = allResults.filter(r => r.videoId);
  if (bqTargets.length > 0) {
    console.log(`[WRITE] BigQuery同期中 (${bqTargets.length}件)...`);
    try {
      const valuesSql = bqTargets.map((_, j) => `SELECT @vId${j} as vId, @cTitle${j} as cTitle`).join(' UNION ALL ');
      const params = {};
      bqTargets.forEach((r, j) => {
        params[`vId${j}`] = r.videoId;
        params[`cTitle${j}`] = r.cleanTitle;
      });
      await bq.query({
        query: `MERGE \`heat_ranking.songs_master\` T USING (${valuesSql}) S ON T.videoId = S.vId WHEN MATCHED THEN UPDATE SET cleanTitle = S.cTitle`,
        params,
      });
      console.log(`  BigQuery: ${bqTargets.length}件 更新完了`);
    } catch (e) {
      console.warn(`  BigQuery更新失敗（Sheets側は完了済み）: ${e.message}`);
    }
  }

  console.log('\n[WRITE] 完了');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
