/**
 * platform_rankings に記録済みの Spotify track_id を使って
 * Spotify Web API から ISRC を取得し、heat_songs テーブルと
 * SONGS シートの L 列 (isrc) に保存する。
 *
 * 前提:
 *  - .env.local に SPOTIFY_CLIENT_ID と SPOTIFY_CLIENT_SECRET を追加すること
 *  - Spotify Dashboard (https://developer.spotify.com/dashboard) で無料アプリを作成
 *  - platform_rankings の youtube_video_id がリンク済みの曲のみ処理
 *
 * Run: node scripts/fetch-spotify-isrc.mjs
 */
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');

const SPOTIFY_CLIENT_ID     = getEnv('SPOTIFY_CLIENT_ID');
const SPOTIFY_CLIENT_SECRET = getEnv('SPOTIFY_CLIENT_SECRET');
const SHEET_ID              = getEnv('NEXT_PUBLIC_SHEET_ID');

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('❌ SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が .env.local にありません');
  console.error('   https://developer.spotify.com/dashboard でアプリを作成し、');
  console.error('   Client ID と Client Secret を .env.local に追加してください:');
  console.error('   SPOTIFY_CLIENT_ID=xxxx');
  console.error('   SPOTIFY_CLIENT_SECRET=xxxx');
  process.exit(1);
}

const creds = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');
const bq     = new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials: creds });
const auth   = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

// ── Spotify Client Credentials ────────────────────────────────────────────────
async function getSpotifyToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Spotify auth failed: ${JSON.stringify(data)}`);
  console.log('Spotify トークン取得完了');
  return data.access_token;
}

// ── Spotify batch track fetch (max 50 per request) ───────────────────────────
async function fetchTracks(token, trackIds) {
  const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${trackIds.join(',')}&market=KH`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Spotify token expired');
  const data = await res.json();
  return data.tracks || [];
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('Spotify ISRC 取得を開始します...\n');

const token = await getSpotifyToken();

// リンク済み Spotify 曲を取得 (youtube_video_id が確定しているもの)
const [prRows] = await bq.query(`
  SELECT DISTINCT track_id, youtube_video_id
  FROM \`heat_ranking.platform_rankings\`
  WHERE platform = 'spotify'
    AND is_khmer = TRUE
    AND youtube_video_id IS NOT NULL
    AND youtube_video_id != ''
`);
console.log(`対象: ${prRows.length}件 (リンク済みSpotify曲)`);

if (prRows.length === 0) {
  console.log('処理対象なし。終了します。');
  process.exit(0);
}

// track_id → youtube_video_id のマップ
const trackToVideo = new Map(prRows.map(r => [r.track_id, r.youtube_video_id]));
const trackIds     = [...trackToVideo.keys()];

// Spotify API で ISRC を取得 (50件ずつ)
const isrcMap = new Map(); // youtube_video_id → isrc
const BATCH = 50;

for (let i = 0; i < trackIds.length; i += BATCH) {
  const chunk = trackIds.slice(i, i + BATCH);
  const tracks = await fetchTracks(token, chunk);

  for (const track of tracks) {
    if (!track) continue;
    const isrc    = track.external_ids?.isrc;
    const videoId = trackToVideo.get(track.id);
    if (isrc && videoId) isrcMap.set(videoId, isrc);
  }
  process.stdout.write(`\r  取得: ${Math.min(i + BATCH, trackIds.length)}/${trackIds.length}件`);
}
console.log(`\n  ISRC 取得成功: ${isrcMap.size}件\n`);

if (isrcMap.size === 0) {
  console.log('取得できた ISRC がありませんでした。終了します。');
  process.exit(0);
}

// ── BQ: heat_songs.isrc を更新 ────────────────────────────────────────────────
const heatId = videoId => `KH-${crypto.createHash('sha256').update(String(videoId)).digest('hex').slice(0, 10)}`;

const bqRows = [...isrcMap.entries()].map(([videoId, isrc]) => ({
  heat_id: heatId(videoId),
  isrc,
}));

// TEMP テーブル経由で MERGE
const tempTable = `isrc_temp_${Date.now()}`;
const ds = bq.dataset('heat_ranking');

await ds.table(tempTable).insert(bqRows);
await bq.query(`
  MERGE \`heat_ranking.heat_songs\` T
  USING \`heat_ranking.${tempTable}\` S ON T.heat_id = S.heat_id
  WHEN MATCHED AND (T.isrc IS NULL OR T.isrc = '') THEN
    UPDATE SET T.isrc = S.isrc, T.updated_at = CURRENT_TIMESTAMP()
`);
await ds.table(tempTable).delete();
console.log(`BQ heat_songs.isrc を ${isrcMap.size}件 更新しました`);

// ── Sheets: SONGS!L 列を更新 ──────────────────────────────────────────────────
const { data: videoData } = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'SONGS!A2:A',
});
const videoIds = (videoData.values || []).map(r => (r[0] || '').trim());

const updates = [];
for (let i = 0; i < videoIds.length; i++) {
  const isrc = isrcMap.get(videoIds[i]);
  if (isrc) updates.push({ range: `SONGS!L${i + 2}`, values: [[isrc]] });
}

if (updates.length > 0) {
  const SBATCH = 500;
  for (let i = 0; i < updates.length; i += SBATCH) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updates.slice(i, i + SBATCH) },
    });
  }
  console.log(`SONGS シート L列 (isrc) を ${updates.length}件 更新しました`);
}

console.log('\n✅ 完了');
