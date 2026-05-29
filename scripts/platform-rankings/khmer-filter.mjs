/**
 * 3-Stage Khmer Song Filter
 *
 * Stage 1 — Script detection  (no API, instant)
 *   Khmer Unicode → INCLUDE  |  Thai/Korean/Japanese/CJK → EXCLUDE
 *
 * Stage 2 — Artist DB match  (Google Sheets, fast)
 *   Artist found in Artists sheet (exact or substring) → INCLUDE
 *
 * Stage 3 — Gemini AI       (Vertex AI via service account, batch)
 *   For songs that passed neither Stage 1 nor Stage 2:
 *   Ask Gemini "Is [artist] a Cambodian/Khmer artist?"
 *   Results cached in PLATFORM_ARTIST_CACHE sheet (never re-queried)
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

// ── Unicode ranges ────────────────────────────────────────────────────────────
const KHMER_RE = /[ក-៿]/;
const FOREIGN_SCRIPT_RE = /[฀-๿຀-ໟက-႟가-힯ぁ-ヿ一-鿿؀-ۿऀ-ॿ]/;

// ── Apple Music Khmer genre keyword ─────────────────────────────────────────
const KHMER_GENRE_RE = /khmer|cambodia|cambodian|ចម្រៀង|ខ្មែរ/i;

// ── Well-known non-Cambodian artists (hard reject, no AI check) ──────────────
const HARD_REJECT_ARTISTS = new Set([
  // Global pop / Western
  'taylor swift','ed sheeran','dua lipa','bad bunny','drake','post malone',
  'billie eilish','ariana grande','olivia rodrigo','harry styles','adele',
  'charlie puth','justin bieber','shawn mendes','selena gomez','coldplay',
  'maroon 5','imagine dragons','katy perry','michael jackson','the script',
  'cigarettes after sex','lil wayne','lloyd','priscilla chan','bruno mars',
  'sabrina carpenter','lana del rey','sza','lady gaga','the 1975','sombr',
  'pinkpantheress','madison beer','daniel caesar','tame impala','olivia dean',
  'doechii','playboi carti','zara larsson','tems','katseye',
  // The Weeknd & collabs
  'the weeknd','the weeknd & playboi carti','the weeknd, ariana grande',
  // K-pop solos & groups
  'bts','blackpink','twice','stray kids','newjeans','aespa','ive',
  'le sserafim','seventeen','enhypen','wave to earth','jay park',
  'jennie','rosé','lisa','jisoo','j-hope','rm','suga','jin','jimin','v',
  // Others
  'wizkid',
  // Confirmed non-Khmer (manually reviewed)
  'cortis',
]);

// Split "Artist A & Artist B, feat. C" → ['artist a', 'artist b', 'c']
function splitArtists(artistStr) {
  return artistStr
    .toLowerCase()
    .split(/[,&×\/]|\bfeat\.?\b|\bft\.?\b|\bwith\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function isHardReject(artistStr) {
  const parts = splitArtists(artistStr);
  return parts.some(p => HARD_REJECT_ARTISTS.has(p));
}

function getEnv(k) {
  return (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSheets() {
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!rawJson) return null;
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Stage 2: Load known Khmer artists from Artists sheet ─────────────────────

export async function loadKhmerArtists() {
  const sheets = getSheets();
  const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
  if (!sheets || !SHEET_ID) return new Set();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Artists!A2:A',
    });
    const names = (res.data.values || [])
      .map(r => (r[0] || '').trim().toLowerCase())
      .filter(s => s.length > 0);
    console.log(`[KhmerFilter] Loaded ${names.length} artists from sheet`);
    return new Set(names);
  } catch (e) {
    console.warn('[KhmerFilter] Artists sheet load failed:', e.message);
    return new Set();
  }
}

// ── Stage 3: Gemini AI artist cache (PLATFORM_ARTIST_CACHE sheet) ─────────────

const CACHE_SHEET = 'PLATFORM_ARTIST_CACHE';

async function loadArtistCache() {
  const sheets = getSheets();
  const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
  if (!sheets || !SHEET_ID) return new Map();

  try {
    // Ensure cache sheet exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const exists = meta.data.sheets.some(s => s.properties.title === CACHE_SHEET);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: CACHE_SHEET } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${CACHE_SHEET}'!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['artist_key', 'is_cambodian', 'verified_at']] },
      });
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${CACHE_SHEET}'!A2:C`,
    });

    const cache = new Map();
    for (const row of (res.data.values || [])) {
      const key = (row[0] || '').trim().toLowerCase();
      const isCambodia = (row[1] || '').toLowerCase() === 'true';
      if (key) cache.set(key, isCambodia);
    }
    console.log(`[KhmerFilter] Artist cache loaded: ${cache.size} entries`);
    return cache;
  } catch (e) {
    console.warn('[KhmerFilter] Artist cache load failed:', e.message);
    return new Map();
  }
}

async function saveArtistCache(newEntries) {
  // newEntries: [{artist_key, is_cambodian}]
  if (newEntries.length === 0) return;

  const sheets = getSheets();
  const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
  if (!sheets || !SHEET_ID) return;

  const now = new Date().toISOString().split('T')[0];
  const rows = newEntries.map(e => [e.artist_key, String(e.is_cambodian), now]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${CACHE_SHEET}'!A:C`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
    console.log(`[KhmerFilter] Saved ${rows.length} new AI verifications to cache`);
  } catch (e) {
    console.warn('[KhmerFilter] Cache save failed:', e.message);
  }
}

// ── Stage 3: Gemini batch classification ─────────────────────────────────────

async function geminiClassifyArtists(artistNames) {
  // artistNames: string[] — unique artist names to classify
  if (artistNames.length === 0) return new Map();

  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  if (!rawJson || !PROJECT_ID) {
    console.warn('[KhmerFilter] Gemini skipped: missing credentials');
    return new Map();
  }

  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const auth = new GoogleAuth({
    credentials,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const numbered = artistNames.map((a, i) => `${i + 1}. "${a}"`).join('\n');

  const prompt = `You are classifying artists by ETHNICITY/ORIGIN only — NOT by popularity in Cambodia.

RULE: Answer YES only if the artist is ethnically Cambodian or born in Cambodia.
Answer NO if the artist is from any other country, even if their music is popular in Cambodia.

CORRECT examples:
- VannDa → YES (Cambodian rapper, born in Cambodia)
- Meezy24k → YES (Cambodian-American)
- Bruno Mars → NO (American, Filipino/Puerto Rican descent)
- Katy Perry → NO (American)
- Olivia Rodrigo → NO (American, Filipino descent — but NOT Cambodian)
- The Weeknd → NO (Canadian, Ethiopian descent — NOT Cambodian)
- BTS → NO (Korean)
- Billie Eilish → NO (American)

These artists were found on Cambodia charts. Most are international artists popular in Cambodia but NOT Cambodian.
Only answer YES for artists who are actually Cambodian/Khmer by ethnicity or origin.

Artists to classify:
${numbered}

Respond ONLY with valid JSON:
{"results": [{"n": 1, "artist": "...", "is_cambodian": true}, ...]}`;

  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/gemini-2.0-flash-001:generateContent`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.1 },
      }),
      timeout: 20000,
    });

    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    text = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    const resultMap = new Map();
    for (const item of (parsed.results || [])) {
      const key = (item.artist || artistNames[item.n - 1] || '').toLowerCase().trim();
      resultMap.set(key, Boolean(item.is_cambodian));
    }

    const yes = [...resultMap.values()].filter(Boolean).length;
    console.log(`[KhmerFilter] Gemini classified ${resultMap.size} artists: ${yes} Cambodian, ${resultMap.size - yes} not`);
    return resultMap;
  } catch (e) {
    console.warn('[KhmerFilter] Gemini classification failed:', e.message);
    return new Map();
  }
}

// ── DB match helper ───────────────────────────────────────────────────────────

function matchesDB(artistLower, khmerArtistSet) {
  if (khmerArtistSet.has(artistLower)) return true;
  // Substring match (min 4 chars) — handles "Tena" ↔ "Tena Khimphun", "VannDa" ↔ "VannDa ft."
  for (const known of khmerArtistSet) {
    if (known.length >= 4 && (artistLower.includes(known) || known.includes(artistLower))) {
      return true;
    }
  }
  return false;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function filterKhmerSongs(songs, khmerArtistSet = new Set()) {
  const definiteInclude = [];  // Stage 1+2 confirmed
  const definiteExclude = [];  // Stage 1 foreign script / hard reject
  const uncertain = [];        // Need Stage 3 AI check

  for (const song of songs) {
    const combined = `${song.title} ${song.artist}`;
    const artistLower = song.artist.toLowerCase().trim();

    // Stage 1a — Khmer script → definite include
    if (KHMER_RE.test(combined)) {
      definiteInclude.push({ ...song, is_khmer: true, _reason: 'khmer_script' });
      continue;
    }

    // Stage 1b — Apple Music Khmer genre → include
    if (KHMER_GENRE_RE.test(song.genre || '')) {
      definiteInclude.push({ ...song, is_khmer: true, _reason: 'khmer_genre' });
      continue;
    }

    // Stage 1c — Foreign script → hard reject
    if (FOREIGN_SCRIPT_RE.test(combined)) {
      definiteExclude.push(song);
      continue;
    }

    // Stage 1d — Known international artist → reject (checks each part of multi-artist strings)
    if (isHardReject(song.artist)) {
      definiteExclude.push(song);
      continue;
    }

    // Stage 2 — DB artist match → include
    if (matchesDB(artistLower, khmerArtistSet)) {
      definiteInclude.push({ ...song, is_khmer: true, _reason: 'artist_db' });
      continue;
    }

    // Stage 3 — Uncertain, needs AI
    uncertain.push(song);
  }

  // Stage 3 — Gemini AI for uncertain songs
  let aiInclude = [];
  if (uncertain.length > 0) {
    console.log(`[KhmerFilter] ${uncertain.length} songs need AI verification...`);

    const cache = await loadArtistCache();

    // Separate cached vs uncached artists
    const uniqueArtists = [...new Set(uncertain.map(s => s.artist.toLowerCase().trim()))];
    const needsQuery = uniqueArtists.filter(a => !cache.has(a));

    // Query Gemini for uncached artists
    if (needsQuery.length > 0) {
      console.log(`[KhmerFilter] Querying Gemini for ${needsQuery.length} new artists...`);
      const aiResults = await geminiClassifyArtists(needsQuery);

      // Merge into cache and save
      const newEntries = [];
      for (const [artistKey, isCambodia] of aiResults) {
        if (!cache.has(artistKey)) {
          cache.set(artistKey, isCambodia);
          newEntries.push({ artist_key: artistKey, is_cambodian: isCambodia });
        }
      }
      await saveArtistCache(newEntries);
    }

    // Apply cache to uncertain songs
    // For multi-artist songs: include if ANY individual artist is Cambodian
    for (const song of uncertain) {
      const key = song.artist.toLowerCase().trim();
      const parts = splitArtists(song.artist);

      const isCambodian =
        cache.get(key) === true ||
        parts.some(p => cache.get(p) === true);

      const allResolved =
        cache.has(key) ||
        parts.every(p => cache.has(p));

      if (isCambodian) {
        aiInclude.push({ ...song, is_khmer: true, _reason: 'ai_verified' });
      } else if (!allResolved) {
        console.warn(`[KhmerFilter] No AI result for "${song.artist}" — excluding`);
      }
    }
  }

  const result = [...definiteInclude, ...aiInclude];

  // Summary log
  const byReason = {};
  for (const s of result) {
    byReason[s._reason] = (byReason[s._reason] || 0) + 1;
  }
  console.log(`[KhmerFilter] Result: ${result.length} Khmer songs`);
  console.log(`  khmer_script: ${byReason.khmer_script || 0}, artist_db: ${byReason.artist_db || 0}, ai_verified: ${byReason.ai_verified || 0}, khmer_genre: ${byReason.khmer_genre || 0}`);
  console.log(`  Excluded: ${definiteExclude.length} songs`);

  return result;
}
