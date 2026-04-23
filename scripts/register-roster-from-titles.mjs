/**
 * register-roster-from-titles.mjs
 *
 * SONGSシートのオレンジ行（artist=プロダクション名 & detectedArtist空）を対象に
 * Gemini でタイトルからアーティスト名を抽出してLabel_Rosterに登録する。
 *
 * Usage:
 *   node scripts/register-roster-from-titles.mjs            # ドライラン（候補一覧）
 *   node scripts/register-roster-from-titles.mjs --register # Label_Rosterに登録
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DO_REGISTER = process.argv.includes('--register');

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

async function extractArtistWithGemini(production, title, token) {
  const prompt = `You are a Cambodian music expert. Given a song title uploaded by a music production channel, extract ONLY the performing artist name.

Production channel: "${production}"
Song title: "${title}"

Rules:
- Return ONLY the main artist/singer name (e.g. "Sokun Therayu", "TON CHANSEYMA", "អ៊ឹម ថៃ")
- If multiple artists, return the primary one only (ignore "ft.", "feat.", "x", "&" collaborators)
- Do NOT return song titles, production names, or labels
- Do NOT return playlist/compilation indicators
- If you cannot determine a clear artist name, return ""

Respond with JSON only: {"artist": "..."}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 100, temperature: 0.1 },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  text = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(text);
  return (parsed.artist || '').trim();
}

async function main() {
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

  console.log(`\n=== register-roster-from-titles / Gemini (${DO_REGISTER ? 'REGISTER' : 'DRY RUN'}) ===\n`);

  // P型プロダクション名セット
  const arRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:F' });
  const prodNames = new Set(
    (arRes.data.values || [])
      .filter(r => ['P', 'Production', 'Label'].includes((r[5] || '').trim()))
      .map(r => (r[0] || '').trim()).filter(Boolean)
  );

  // 既存Label_Roster（重複登録防止）
  const rrRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A2:C' });
  const existingKeys = new Set(
    (rrRes.data.values || []).map(r => `${(r[0]||'').trim()}|${(r[1]||'').trim()}`.toLowerCase())
  );

  // SONGSのオレンジ行（artist=production & detectedArtist空）
  const soRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A:J' });
  const dataRows = (soRes.data.values || []).slice(1);
  const targets = dataRows
    .map((r, i) => ({ rowIndex: i, videoId: r[0], artist: (r[1]||'').trim(), title: (r[2]||'').trim(), detected: (r[7]||'').trim() }))
    .filter(r => prodNames.has(r.artist) && !r.detected);

  console.log(`対象（オレンジ行）: ${targets.length} 曲\nGeminiで抽出中...\n`);

  // Vertex AI トークン取得
  const client = await vertexAuth.getClient();
  const { token } = await client.getAccessToken();

  // Geminiで抽出
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    process.stdout.write(`  [${i + 1}/${targets.length}] ${t.title.slice(0, 50)}...\r`);
    try {
      const artist = await extractArtistWithGemini(t.artist, t.title, token);
      results.push({ ...t, extractedArtist: artist });
    } catch (e) {
      results.push({ ...t, extractedArtist: '', error: e.message });
    }
    // レート制限対策
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('');

  // 仕分け
  const toRegister = [];
  const skipped    = [];

  const seenKeys = new Set();
  for (const r of results) {
    if (!r.extractedArtist) {
      skipped.push({ ...r, reason: r.error || '抽出不可' });
      continue;
    }
    const key = `${r.artist}|${r.extractedArtist}`.toLowerCase();
    if (existingKeys.has(key) || seenKeys.has(key)) {
      skipped.push({ ...r, reason: 'Label_Rosterに既存' });
      continue;
    }
    seenKeys.add(key);
    toRegister.push({ prod: r.artist, artist: r.extractedArtist, keyword: r.extractedArtist.toLowerCase(), title: r.title });
  }

  console.log(`--- 登録候補 (${toRegister.length}件) ---`);
  toRegister.forEach(r =>
    console.log(`  prod="${r.prod}" → artist="${r.artist}"\n    ← ${r.title}`)
  );

  if (skipped.length > 0) {
    console.log(`\n--- スキップ (${skipped.length}件) ---`);
    skipped.forEach(r => console.log(`  [${r.reason}] [${r.artist}] ${r.title}`));
  }

  if (!DO_REGISTER) {
    console.log(`\n[DRY RUN] 変更なし。--register で登録実行。`);
    return;
  }

  if (toRegister.length === 0) {
    console.log('\n登録候補なし。');
    return;
  }

  console.log(`\n[REGISTER] ${toRegister.length}件をLabel_Rosterに追加中...`);
  for (const r of toRegister) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Label_Roster!A2:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[r.prod, r.artist, r.keyword]] },
    });
    console.log(`  追加: "${r.prod}" | "${r.artist}"`);
  }

  console.log('\n[REGISTER] 完了');
  console.log('次: node scripts/fix-production-artist-names.mjs --fix でSONGSを更新');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
