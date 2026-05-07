import { BigQuery } from '@google-cloud/bigquery';

function normalizeForMatch(str) {
  return (str || '')
    .normalize('NFC')
    .replace(/[​-‏­﻿⁠]/g, '')
    .toLowerCase()
    .replace(/[\(\[]\s*(feat|ft|featuring|with)\.?\s+[^\)\]]+[\)\]]/gi, '')
    .replace(/\s+(feat|ft|featuring)\.?\s+.+$/i, '')
    .replace(/\s*[-–]\s*(official|mv|music video|lyric|audio|remix|remaster|version|ver\.?|slowed|sped up).*/i, '')
    .replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
    .replace(/[^\wក-៿\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 改善A: YouTubeタイトルを "-" で分割し、Latin文字のみのセグメントを抽出
// "ចំណូលចិត្ត - Chhamnoul Chet - VannDa" → ["chhamnoul chet", "vannda"]
const SEGMENT_NOISE_RE = /^(official|mv|music|video|lyric|audio|remix|ver|vol|vcd|\d+)$/i;
function extractLatinSegments(title) {
  return title.split(/\s*-\s*/)
    .map(s => s.replace(/[ក-៿]/g, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(s => s.length >= 3 && !SEGMENT_NOISE_RE.test(s) && /[a-z]/.test(s));
}

// 改善C: プラットフォームのアーティスト文字列を個別アーティストに分割
// "Vanthan & VannDa" → ["vanthan", "vannda"]
// "La Cima Cartel, All3rgy & Chan SreyKhouch" → ["la cima cartel", "all3rgy", "chan sreykhouch"]
function splitPlatformArtists(artistStr) {
  return (artistStr || '')
    .split(/\s*[,&×]\s*|\s+and\s+/i)
    .map(s => normalizeForMatch(s))
    .filter(s => s.length > 0);
}

function addToMap(map, ambiguous, key, videoId) {
  if (!key) return;
  if (map.has(key) && map.get(key) !== videoId) {
    ambiguous.add(key);
  } else {
    map.set(key, videoId);
  }
}

export async function linkToYouTube(songs) {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');

  if (!rawJson || !PROJECT_ID) {
    console.warn('[YouTube Linker] Missing credentials, skipping link step');
    return;
  }

  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

  let rows;
  try {
    [rows] = await bq.query(`
      SELECT videoId, cleanTitle, title, artist, publishedAt
      FROM \`heat_ranking.songs_master\`
      WHERE videoId IS NOT NULL AND title IS NOT NULL
    `);
  } catch (e) {
    console.warn('[YouTube Linker] songs_master query failed:', e.message);
    return;
  }

  // ── インデックス構築 ──────────────────────────────────────────────────────
  const byTitleArtist    = new Map(); // "normTitle||normArtist" → videoId  (score 1.0)
  const byTitle          = new Map(); // normTitle → videoId                 (score 0.8)
  const byTitleAmbiguous = new Set();

  // 改善A: Latin副題セグメント
  const bySegArtist    = new Map(); // "seg||normArtist" → videoId          (score 0.75)
  const bySeg          = new Map(); // seg → videoId                        (score 0.6)
  const bySegAmbiguous = new Set();

  // 改善C: アーティスト → 曲リスト (個別アーティスト分割後の日付近接用)
  const byArtistSongs  = new Map(); // normArtist → [{videoId, publishedAt}]

  for (const row of rows) {
    const normTitle  = normalizeForMatch(row.cleanTitle || row.title);
    const normArtist = normalizeForMatch(row.artist);
    if (!normTitle) continue;

    // 既存インデックス
    addToMap(byTitle, byTitleAmbiguous, normTitle, row.videoId);
    if (normArtist) byTitleArtist.set(`${normTitle}||${normArtist}`, row.videoId);

    let stripped = normTitle;
    if (normArtist && stripped.startsWith(normArtist)) {
      stripped = stripped.slice(normArtist.length).replace(/^\s*[-–]\s*/, '').trim();
    }
    if (stripped && stripped !== normTitle) {
      addToMap(byTitle, byTitleAmbiguous, stripped, row.videoId);
      if (normArtist) byTitleArtist.set(`${stripped}||${normArtist}`, row.videoId);

      const strippedLatinOnly = stripped.replace(/[ក-៿]/g, '').replace(/\s+/g, ' ').trim();
      if (strippedLatinOnly && strippedLatinOnly !== stripped) {
        addToMap(byTitle, byTitleAmbiguous, strippedLatinOnly, row.videoId);
        if (normArtist) byTitleArtist.set(`${strippedLatinOnly}||${normArtist}`, row.videoId);
      }
    }

    const latinOnly = normTitle.replace(/[ក-៿]/g, '').replace(/\s+/g, ' ').trim();
    if (latinOnly && latinOnly !== normTitle) {
      addToMap(byTitle, byTitleAmbiguous, latinOnly, row.videoId);
      if (normArtist) byTitleArtist.set(`${latinOnly}||${normArtist}`, row.videoId);
    }

    // 改善A: Latin副題セグメントインデックス
    for (const seg of extractLatinSegments(row.cleanTitle || row.title)) {
      addToMap(bySeg, bySegAmbiguous, seg, row.videoId);
      if (normArtist) bySegArtist.set(`${seg}||${normArtist}`, row.videoId);
    }

    // 改善C: アーティスト別リスト
    if (normArtist) {
      if (!byArtistSongs.has(normArtist)) byArtistSongs.set(normArtist, []);
      byArtistSongs.get(normArtist).push({ videoId: row.videoId, publishedAt: new Date(row.publishedAt) });
    }
  }

  // ── マッチング ────────────────────────────────────────────────────────────
  let matched = 0;

  for (const song of songs) {
    const normTitle  = normalizeForMatch(song.title);
    const normArtist = normalizeForMatch(song.artist);

    // ── score 1.0: タイトル + アーティスト完全一致 ──
    if (byTitleArtist.has(`${normTitle}||${normArtist}`)) {
      song.youtube_video_id    = byTitleArtist.get(`${normTitle}||${normArtist}`);
      song.youtube_match_score = 1.0;
      matched++; continue;
    }

    // ── score 0.8: タイトルのみ一致 (曖昧なし) ──
    if (byTitle.has(normTitle) && !byTitleAmbiguous.has(normTitle)) {
      song.youtube_video_id    = byTitle.get(normTitle);
      song.youtube_match_score = 0.8;
      matched++; continue;
    }

    // ── 改善A: score 0.75 / 0.6: Latin副題セグメント一致 ──
    const segKey = `${normTitle}||${normArtist}`;
    if (bySegArtist.has(segKey)) {
      song.youtube_video_id    = bySegArtist.get(segKey);
      song.youtube_match_score = 0.75;
      matched++; continue;
    }
    if (bySeg.has(normTitle) && !bySegAmbiguous.has(normTitle)) {
      song.youtube_video_id    = bySeg.get(normTitle);
      song.youtube_match_score = 0.6;
      matched++; continue;
    }

    // ── 改善C: コラボアーティスト分割 + タイトル再マッチ ──
    const artistParts = splitPlatformArtists(song.artist);
    if (artistParts.length > 1) {
      let foundC = false;
      for (const part of artistParts) {
        // タイトル + 個別アーティスト
        if (byTitleArtist.has(`${normTitle}||${part}`)) {
          song.youtube_video_id    = byTitleArtist.get(`${normTitle}||${part}`);
          song.youtube_match_score = 0.7;
          matched++; foundC = true; break;
        }
        // Latin副題 + 個別アーティスト
        if (bySegArtist.has(`${normTitle}||${part}`)) {
          song.youtube_video_id    = bySegArtist.get(`${normTitle}||${part}`);
          song.youtube_match_score = 0.65;
          matched++; foundC = true; break;
        }
      }
      if (foundC) continue;

      // タイトル完全一致なし → 個別アーティスト + 日付近接 (score 0.4)
      const collectionDate = new Date(song.date?.value || song.date || Date.now());
      const windowStart    = new Date(collectionDate);
      windowStart.setDate(windowStart.getDate() - 180);

      for (const part of artistParts) {
        if (!byArtistSongs.has(part)) continue;
        const candidates = byArtistSongs.get(part)
          .filter(c => c.publishedAt >= windowStart && c.publishedAt <= collectionDate)
          .sort((a, b) => b.publishedAt - a.publishedAt);
        if (candidates.length === 1) {
          song.youtube_video_id    = candidates[0].videoId;
          song.youtube_match_score = 0.4;
          matched++; break;
        }
      }
    }
  }

  console.log(`[YouTube Linker] ${matched}/${songs.length} songs matched to YouTube`);
}
