import { revisitPosts, extractYouTubeLinks } from './apify-scraper.mjs';
import { classifyPosts } from './ai-filter.mjs';
import { writePosts, getPostsForRevisit } from './bq-writer.mjs';

function normalizePost(raw, meta, phase) {
  const youtubeLinks = extractYouTubeLinks(raw);
  return {
    post_url:      raw.url        || meta.post_url,
    phase,
    artist_id:     meta.artist_id  || null,
    song_id:       meta.song_id    || null,
    release_id:    meta.release_id || null,
    album_name:    meta.album_name || null,
    fb_page_url:   meta.fb_page_url || null,
    fb_video_url:  raw.videoUrl   || meta.fb_video_url || null,
    post_text:     raw.text       || null,
    post_date:     raw.time       || null,
    views:         raw.viewsCount ?? null,
    reactions:     raw.likes      ?? raw.reactions ?? null,
    comments:      raw.comments   ?? null,
    shares:        raw.shares     ?? null,
    youtube_links: youtubeLinks,
  };
}

/**
 * Re-scrape posts from N days ago (phase 3 or 6) and write updated metrics.
 */
export async function runRevisit(bq, phase) {
  const pendingMeta = await getPostsForRevisit(bq, phase);
  if (pendingMeta.length === 0) {
    console.log(`[Revisit] No phase-${phase} revisits due today`);
    return 0;
  }

  console.log(`[Revisit] Phase ${phase}: ${pendingMeta.length} posts to revisit`);
  const postUrls = pendingMeta.map(m => m.post_url);

  let rawPosts = [];
  try {
    rawPosts = await revisitPosts(postUrls);
  } catch (e) {
    console.error(`[Revisit] APIFY failed for phase ${phase}: ${e.message}`);
    return 0;
  }

  // Match scraped results back to metadata by post_url
  const metaByUrl = Object.fromEntries(pendingMeta.map(m => [m.post_url, m]));
  const normalized = rawPosts
    .filter(raw => raw.url && metaByUrl[raw.url])
    .map(raw => normalizePost(raw, metaByUrl[raw.url], phase));

  if (normalized.length === 0) {
    console.warn(`[Revisit] Phase ${phase}: APIFY returned no matching posts`);
    return 0;
  }

  const classified = await classifyPosts(normalized);
  await writePosts(classified);
  return classified.length;
}
