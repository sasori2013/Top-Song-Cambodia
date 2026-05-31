/**
 * FB Community — Facebook engagement scraper for Khmer music
 *
 * Runs independently from the main HEAT pipeline.
 * Triggered by new song detection; scrapes FB artist pages for community engagement.
 * Revisits posts at Day+3 and Day+6 to capture full engagement arc.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { detectNewSongs } from './new-songs-detector.mjs';
import { scrapePages, extractYouTubeLinks } from './apify-scraper.mjs';
import { classifyPosts } from './ai-filter.mjs';
import { writePosts, createBQ } from './bq-writer.mjs';
import { runRevisit } from './revisit-scheduler.mjs';
import { sendTelegramNotification } from '../telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const POSTS_PER_PAGE = 5; // keep APIFY cost low ($0.005/post)

async function main() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`\n========================================`);
  console.log(` FB Community: ${today}`);
  console.log(`========================================\n`);

  const bq = createBQ();
  const errors = [];
  let phase0Count = 0, phase3Count = 0, phase6Count = 0;

  // ── Phase 0: New songs today ─────────────────────────────────────────────
  let newSongs = [];
  try {
    newSongs = await detectNewSongs();
  } catch (e) {
    errors.push(`[Detector] ${e.message}`);
    console.error('New song detection failed:', e.message);
  }

  if (newSongs.length > 0) {
    // Normalize FB URL: strip protocol, www, trailing slash, query params
    const normUrl = url => (url || '').toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '')
      .split('?')[0];

    // Extract FB page slug (e.g. "sulyphengofficial") — returns null for reel/watch/etc.
    const NON_PAGE = new Set(['reel','watch','video','groups','events','pages','share','photo','story']);
    const fbSlug = url => {
      const m = (url || '').match(/facebook\.com\/([^/?#\s]+)/i);
      if (!m) return null;
      const s = m[1].toLowerCase();
      return NON_PAGE.has(s) ? null : s;
    };

    // Deduplicate FB pages. pageMap is keyed by BOTH normalized URL and slug
    // so we can match even when APIFY returns a redirected URL.
    const pageMap = new Map(); // key → [song meta]
    const originalUrls = new Map(); // normalized key → original fb_page_url (for APIFY)
    for (const song of newSongs) {
      if (!song.fb_page_url) continue;
      const norm = normUrl(song.fb_page_url);
      const slug = fbSlug(song.fb_page_url);
      for (const key of [norm, slug]) {
        if (!key) continue;
        if (!pageMap.has(key)) { pageMap.set(key, []); originalUrls.set(key, song.fb_page_url); }
        pageMap.get(key).push(song);
      }
    }

    // Use original URLs for APIFY scraping (deduplicated by normalized URL key)
    const seenNorm = new Set();
    const fbPageUrls = [];
    for (const song of newSongs) {
      if (!song.fb_page_url) continue;
      const norm = normUrl(song.fb_page_url);
      if (!seenNorm.has(norm)) { seenNorm.add(norm); fbPageUrls.push(song.fb_page_url); }
    }
    console.log(`\n--- Phase 0: ${newSongs.length} new songs, ${fbPageUrls.length} unique FB pages ---`);

    let rawPosts = [];
    try {
      rawPosts = await scrapePages(fbPageUrls, POSTS_PER_PAGE);
    } catch (e) {
      errors.push(`[APIFY Phase0] ${e.message}`);
      console.error('APIFY scrape failed:', e.message);
    }

    if (rawPosts.length > 0) {
      // Attach song/artist metadata: match post back to song
      // Priority: pageUrl (APIFY page field) → slug from post_url → YouTube link match
      const normalized = rawPosts.map(raw => {
        const pageUrl = raw.pageUrl || raw.pageDetails?.url || '';
        const postUrl = raw.url || '';
        const songs = pageMap.get(normUrl(pageUrl))
                   || pageMap.get(fbSlug(pageUrl))
                   || pageMap.get(fbSlug(postUrl))  // fallback: slug from post URL
                   || [];
        const youtubeLinks = extractYouTubeLinks(raw);
        // YT-link: exact match by video ID
        // Single release: unambiguous song_id
        // Album/EP (2+ songs): song_id=null, use release_id instead
        const ytMatchedSong = songs.find(s => youtubeLinks.includes(s.video_id));
        const song = ytMatchedSong || (songs.length === 1 ? songs[0] : {});
        // For album releases, all songs share the same release_id
        const releaseId  = song.release_id  || songs.find(s => s.release_id)?.release_id  || null;
        const albumName  = song.album_name  || songs.find(s => s.album_name)?.album_name  || null;
        return {
          post_url:      raw.url      || '',
          phase:         0,
          artist_id:     songs[0]?.artist_id || null,
          song_id:       song.video_id   || null,
          release_id:    releaseId,
          album_name:    albumName,
          fb_page_url:   pageUrl || songs[0]?.fb_page_url || null,
          fb_video_url:  raw.videoUrl    || null,
          post_text:     raw.text        || null,
          post_date:     raw.time        || null,
          views:         raw.viewsCount  ?? null,
          reactions:     raw.likes       ?? raw.reactions ?? null,
          comments:      raw.comments    ?? null,
          shares:        raw.shares      ?? null,
          youtube_links: youtubeLinks,
        };
      }).filter(p => p.post_url); // drop posts with no URL (can't revisit)

      try {
        const classified = await classifyPosts(normalized);
        await writePosts(classified);
        phase0Count = classified.length;
      } catch (e) {
        errors.push(`[BQ Phase0] ${e.message}`);
        console.error('BQ write failed (phase 0):', e.message);
      }
    }
  } else {
    console.log('No new songs with FB pages today — skipping Phase 0');
  }

  // ── Phase 3 & 6 revisits ─────────────────────────────────────────────────
  console.log('\n--- Revisits ---');
  try {
    phase3Count = await runRevisit(bq, 3);
  } catch (e) {
    errors.push(`[Revisit Phase3] ${e.message}`);
    console.error('Revisit phase 3 failed:', e.message);
  }
  try {
    phase6Count = await runRevisit(bq, 6);
  } catch (e) {
    errors.push(`[Revisit Phase6] ${e.message}`);
    console.error('Revisit phase 6 failed:', e.message);
  }

  // ── Telegram summary ─────────────────────────────────────────────────────
  const status = errors.length > 0 ? '⚠️' : '✅';
  let msg =
    `${status} <b>FB Community ${today}</b>\n\n` +
    `🆕 Phase 0 (new):  <b>${phase0Count}</b> posts\n` +
    `📅 Phase 3 (Day+3): <b>${phase3Count}</b> posts updated\n` +
    `📅 Phase 6 (Day+6): <b>${phase6Count}</b> posts updated\n`;

  if (newSongs.length > 0) {
    msg += `\n<b>新曲 (${newSongs.length}曲):</b>\n`;
    for (const s of newSongs.slice(0, 10)) {
      msg += `• ${s.artist} — ${s.title}\n`;
    }
  }

  if (errors.length > 0) {
    msg += `\n<b>エラー:</b>\n${errors.map(e => `• ${e}`).join('\n')}`;
  }

  await sendTelegramNotification(msg);
  console.log('\n=== Done ===');
}

main().catch(async e => {
  console.error('Fatal error:', e);
  await sendTelegramNotification(
    `🚨 <b>FB Community — 致命的エラー</b>\n\n<code>${e.message}</code>`
  ).catch(() => {});
  process.exit(1);
});
