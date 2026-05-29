/**
 * Platform Rankings — Apple Music & Spotify Cambodia
 *
 * Runs independently from the main HEAT pipeline.
 * Fetches daily Khmer song rankings, saves to BigQuery + Google Sheets,
 * and notifies via Telegram.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { fetchAppleMusicRanking } from './apple-music.mjs';
import { fetchSpotifyRanking } from './spotify.mjs';
import { filterKhmerSongs, loadKhmerArtists } from './khmer-filter.mjs';
import { linkToYouTube } from './youtube-linker.mjs';
import { writeToBigQuery, writeRawToBigQuery } from './bq-writer.mjs';
import { writeToSheets } from './sheets-writer.mjs';
import { sendTelegramNotification } from '../telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const today = new Date().toISOString().split('T')[0];

// Minimum expected Khmer songs per platform — alert if below threshold (D)
const AM_KHMER_MIN = 5;
const SP_KHMER_MIN = 5;

async function main() {
  console.log(`\n========================================`);
  console.log(` Platform Rankings: ${today}`);
  console.log(`========================================\n`);

  const errors = [];
  const results = { appleMusic: null, spotify: null };
  const rawAll = []; // all songs before filtering, for archive (B)

  // 1. Load known Khmer artists from the Artists sheet for filtering
  let khmerArtists = new Set();
  try {
    khmerArtists = await loadKhmerArtists();
  } catch (e) {
    console.warn('Khmer artist list load failed (non-fatal):', e.message);
  }

  // 2. Fetch Apple Music Cambodia top 100
  let rawApple = [];
  try {
    console.log('--- Apple Music ---');
    rawApple = await fetchAppleMusicRanking();
    const amFiltered = await filterKhmerSongs(rawApple, khmerArtists);
    results.appleMusic = amFiltered
      .sort((a, b) => a.rank - b.rank)
      .map((s, i) => ({ ...s, rank: i + 1 }));
    console.log(`Apple Music: ${rawApple.length} total → ${results.appleMusic.length} Khmer songs kept`);
    if (results.appleMusic.length < AM_KHMER_MIN) {
      errors.push(`[Apple Music] Khmer曲が少なすぎます (${results.appleMusic.length}曲、期待値: ${AM_KHMER_MIN}曲以上)`);
    }
  } catch (e) {
    errors.push(`[Apple Music] ${e.message}`);
    console.error('Apple Music fetch failed:', e.message);
  }

  // 3. Fetch Spotify Cambodia trending
  let rawSpotify = [];
  try {
    console.log('\n--- Spotify ---');
    rawSpotify = await fetchSpotifyRanking();
    const spFiltered = await filterKhmerSongs(rawSpotify, khmerArtists);
    results.spotify = spFiltered
      .sort((a, b) => a.rank - b.rank)
      .map((s, i) => ({ ...s, rank: i + 1 }));
    console.log(`Spotify: ${rawSpotify.length} total → ${results.spotify.length} Khmer songs kept`);
    if (results.spotify.length < SP_KHMER_MIN) {
      errors.push(`[Spotify] Khmer曲が少なすぎます (${results.spotify.length}曲、期待値: ${SP_KHMER_MIN}曲以上)`);
    }
  } catch (e) {
    errors.push(`[Spotify] ${e.message}`);
    console.error('Spotify fetch failed:', e.message);
  }

  const allSongs = [...(results.appleMusic || []), ...(results.spotify || [])];

  if (allSongs.length === 0) {
    const msg =
      `🚨 <b>Platform Rankings (${today}) — データ取得ゼロ</b>\n\n` +
      errors.map(e => `• ${e}`).join('\n');
    await sendTelegramNotification(msg);
    process.exit(1);
  }

  // 4. Link to YouTube (songs_master in BQ)
  console.log('\n--- YouTube Linking ---');
  try {
    await linkToYouTube(allSongs);
  } catch (e) {
    console.warn('YouTube linking failed (non-fatal):', e.message);
  }

  // 5. Save to BigQuery (filtered Khmer songs)
  console.log('\n--- BigQuery ---');
  try {
    await writeToBigQuery(results);
  } catch (e) {
    const detail = e.message || (e.errors ? JSON.stringify(e.errors.slice(0, 2)) : String(e));
    errors.push(`[BigQuery] ${detail}`);
    console.error('BigQuery write failed:', detail);
  }

  // 5b. Save raw full rankings to BigQuery (all songs, is_khmer marks inclusion) (B)
  try {
    const includedIds = new Set(allSongs.map(s => s.track_id).filter(Boolean));
    rawAll.push(
      ...rawApple.map(s => ({ ...s, is_khmer: includedIds.has(s.track_id) })),
      ...rawSpotify.map(s => ({ ...s, is_khmer: includedIds.has(s.track_id) })),
    );
    await writeRawToBigQuery(rawAll);
  } catch (e) {
    console.warn('Raw BQ write failed (non-fatal):', e.message);
  }

  // 6. Save to Google Sheets
  console.log('\n--- Google Sheets ---');
  try {
    await writeToSheets(results);
  } catch (e) {
    errors.push(`[Sheets] ${e.message}`);
    console.error('Sheets write failed:', e.message);
  }

  // 7. Telegram summary
  const amCount = results.appleMusic?.length ?? 0;
  const spCount = results.spotify?.length ?? 0;
  const amLinked = (results.appleMusic || []).filter(s => s.youtube_video_id).length;
  const spLinked = (results.spotify || []).filter(s => s.youtube_video_id).length;

  // Collect AI-verified songs (new classifications, not cached) for human review
  const aiVerifiedSongs = allSongs.filter(s => s._reason === 'ai_verified');

  const baseMsg = errors.length > 0
    ? `⚠️ <b>Platform Rankings（一部エラー） ${today}</b>`
    : `✅ <b>Platform Rankings 取得完了 ${today}</b>`;

  let msg =
    `${baseMsg}\n\n` +
    `🎵 Apple Music: <b>${amCount}曲</b> Khmer（YT紐付: ${amLinked}曲）\n` +
    `🟢 Spotify: <b>${spCount}曲</b> Khmer（YT紐付: ${spLinked}曲）\n`;

  // Show AI-verified songs for human review
  if (aiVerifiedSongs.length > 0) {
    msg += `\n🤖 <b>AI判定で新規追加（要確認）:</b>\n`;
    for (const s of aiVerifiedSongs) {
      const platform = s.platform === 'apple_music' ? '🎵' : '🟢';
      msg += `${platform} #${s.rank} "${s.title}" — ${s.artist}\n`;
    }
    msg += `\n※ 違う場合は Artists シートに除外アーティストとして追記してください`;
  }

  if (errors.length > 0) {
    msg += `\n\n<b>エラー:</b>\n${errors.map(e => `• ${e}`).join('\n')}`;
  }

  await sendTelegramNotification(msg);

  console.log('\n=== Done ===');
}

main().catch(async e => {
  console.error('Fatal error:', e);
  await sendTelegramNotification(
    `🚨 <b>Platform Rankings — 致命的エラー</b>\n\n<code>${e.message}</code>`
  ).catch(() => {});
  process.exit(1);
});
