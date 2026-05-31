/**
 * fix-artist-linkage.mjs
 *
 * Retroactively links fb_posts records that have artist_id = NULL.
 *
 * Since fb_page_url and youtube_links are NULL in existing records,
 * we extract the Facebook page slug from post_url and match against
 * artists_master.facebook.
 *
 * Run:
 *   node scripts/fb-community/fix-artist-linkage.mjs          # dry-run
 *   node scripts/fb-community/fix-artist-linkage.mjs --write  # write to BQ
 */

import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const WRITE = process.argv.includes('--write');
const DS = 'heat_ranking';

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

// Extract FB page slug from any Facebook URL
// e.g. https://www.facebook.com/SulyPhengOfficial/posts/... → "sulyphengofficial"
// e.g. https://www.facebook.com/reel/12345 → null (reel URLs have no page info)
function fbPageSlug(url) {
  const m = (url || '').match(/facebook\.com\/([^/?#\s]+)/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const nonPage = ['reel', 'watch', 'video', 'groups', 'events', 'pages', 'share', 'photo', 'story'];
  if (nonPage.includes(slug)) return null;
  return slug;
}

async function main() {
  console.log(`\n=== FB Artist Linkage Fix ${WRITE ? '[WRITE]' : '[DRY RUN]'} ===\n`);
  const bq = createBQ();

  // ── Fetch fb_posts with NULL artist_id ────────────────────────────────────
  const [posts] = await bq.query({
    query: `
      SELECT post_url, fb_page_url, youtube_links
      FROM \`${DS}.fb_posts\`
      WHERE artist_id IS NULL
    `,
  });
  console.log(`Found ${posts.length} posts with artist_id = NULL\n`);
  if (posts.length === 0) { console.log('Nothing to fix.'); return; }

  // ── Build lookup: FB page slug → { channelId, facebook } ─────────────────
  const [artists] = await bq.query({
    query: `
      SELECT channelId, name, facebook
      FROM \`${DS}.artists_master\`
      WHERE facebook IS NOT NULL AND TRIM(facebook) != ''
    `,
  });

  const slugToArtist = new Map();
  for (const a of artists) {
    const slug = fbPageSlug(a.facebook);
    if (slug) slugToArtist.set(slug, { channelId: a.channelId, facebook: a.facebook, name: a.name });
  }
  console.log(`Loaded ${slugToArtist.size} artist FB page slugs\n`);

  // ── Build lookup: youtube video_id → heat_id ─────────────────────────────
  const [songs] = await bq.query({
    query: `
      SELECT heat_id, youtube_video_id
      FROM \`${DS}.heat_songs\`
      WHERE youtube_video_id IS NOT NULL
    `,
  });
  const ytToHeatId = new Map();
  for (const s of songs) ytToHeatId.set(s.youtube_video_id, s.heat_id);

  // ── Match each post ───────────────────────────────────────────────────────
  const updates = [];

  for (const post of posts) {
    const slug = fbPageSlug(post.post_url);
    const artistInfo = slug ? slugToArtist.get(slug) : null;
    const artistId = artistInfo?.channelId || null;
    const fbPageUrl = artistInfo?.facebook || null;

    // youtube_links: try from stored data (likely NULL), fallback to nothing
    const ytLinks = Array.isArray(post.youtube_links) ? post.youtube_links : [];
    let songId = null;
    for (const vid of ytLinks) {
      if (ytToHeatId.has(vid)) { songId = ytToHeatId.get(vid); break; }
    }

    updates.push({ post_url: post.post_url, artist_id: artistId, fb_page_url: fbPageUrl, song_id: songId });

    if (artistId) {
      console.log(`  ✓ ${artistInfo.name} (${slug}) ${songId ? `| song=${songId}` : ''}`);
      console.log(`    ${post.post_url.slice(0, 70)}`);
    } else {
      console.log(`  ✗ ${slug || '(reel/unknown)'} | ${post.post_url.slice(0, 70)}`);
    }
  }

  const matched = updates.filter(u => u.artist_id).length;
  const songMatched = updates.filter(u => u.song_id).length;
  console.log(`\nMatched: ${matched}/${posts.length} artist_id, ${songMatched}/${posts.length} song_id`);

  if (!WRITE) {
    console.log('\n[DRY RUN] Add --write to apply changes');
    return;
  }

  // ── Batch UPDATE ──────────────────────────────────────────────────────────
  const toUpdate = updates.filter(u => u.artist_id);
  if (toUpdate.length === 0) { console.log('\nNo updates to apply.'); return; }

  console.log(`\nUpdating ${toUpdate.length} rows...`);

  const esc = v => v == null ? 'NULL' : `'${String(v).replace(/'/g, "\\'")}'`;

  const BATCH = 50;
  let done = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);

    const artistCases = chunk
      .map(u => `WHEN post_url = ${esc(u.post_url)} THEN ${esc(u.artist_id)}`)
      .join('\n        ');

    const pageCases = chunk
      .map(u => `WHEN post_url = ${esc(u.post_url)} THEN ${esc(u.fb_page_url)}`)
      .join('\n        ');

    const songCases = chunk.filter(u => u.song_id)
      .map(u => `WHEN post_url = ${esc(u.post_url)} THEN ${esc(u.song_id)}`)
      .join('\n        ');

    const postUrls = chunk.map(u => esc(u.post_url)).join(', ');

    let setClause = `
      artist_id   = CASE ${artistCases} ELSE artist_id END,
      fb_page_url = CASE ${pageCases} ELSE fb_page_url END`;

    if (songCases) {
      setClause += `,\n      song_id = CASE ${songCases} ELSE song_id END`;
    }
    setClause += `,\n      scraped_at = CURRENT_TIMESTAMP()`;

    await bq.query({
      query: `
        UPDATE \`${DS}.fb_posts\`
        SET ${setClause}
        WHERE post_url IN (${postUrls})
      `,
    });

    done += chunk.length;
    console.log(`  Updated ${done}/${toUpdate.length}`);
  }

  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
