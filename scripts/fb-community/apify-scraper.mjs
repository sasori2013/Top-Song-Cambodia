import fetch from 'node-fetch';

// apify/facebook-posts-scraper (actor slug)
const ACTOR_SLUG = 'apify~facebook-posts-scraper';
const BASE = 'https://api.apify.com/v2';
const POLL_MS = 15_000;       // poll every 15s
const TIMEOUT_MS = 10 * 60_000; // give up after 10 minutes

function token() {
  return (process.env.APIFY_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
}

async function startRun(startUrls, resultsLimit) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const input = {
    startUrls: startUrls.map(url => ({ url })),
    resultsLimit,
    timeframe: { startDate: sevenDaysAgo }, // only fetch last 7 days
    includeVideoTranscript: false,
  };

  const res = await fetch(`${BASE}/acts/${ACTOR_SLUG}/runs?token=${token()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`APIFY start failed: ${res.status} — ${await res.text()}`);
  const { data } = await res.json();
  return data.id;
}

async function pollUntilDone(runId) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token()}`);
    const { data } = await res.json();
    if (data.status === 'SUCCEEDED') return;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) {
      throw new Error(`APIFY run ${runId} ended with: ${data.status}`);
    }
    console.log(`[APIFY] Run ${runId} status: ${data.status} — waiting…`);
  }
  throw new Error(`APIFY run ${runId} timed out`);
}

async function fetchItems(runId) {
  const res = await fetch(
    `${BASE}/actor-runs/${runId}/dataset/items?token=${token()}&clean=true`
  );
  if (!res.ok) throw new Error(`APIFY results fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Scrape multiple FB page URLs in a single APIFY run.
 * resultsLimit applies per-page.
 */
export async function scrapePages(fbPageUrls, resultsLimit = 5) {
  if (fbPageUrls.length === 0) return [];
  console.log(`[APIFY] Scraping ${fbPageUrls.length} pages × ${resultsLimit} posts`);
  const runId = await startRun(fbPageUrls, resultsLimit);
  console.log(`[APIFY] Run started: ${runId}`);
  await pollUntilDone(runId);
  const items = await fetchItems(runId);
  console.log(`[APIFY] Fetched ${items.length} posts`);
  return items;
}

/**
 * Re-scrape known post URLs (Day3 / Day6 revisits).
 * Passing individual post URLs returns just those posts.
 */
export async function revisitPosts(postUrls) {
  if (postUrls.length === 0) return [];
  console.log(`[APIFY] Revisiting ${postUrls.length} post URLs`);
  const runId = await startRun(postUrls, 1);
  console.log(`[APIFY] Revisit run started: ${runId}`);
  await pollUntilDone(runId);
  const items = await fetchItems(runId);
  console.log(`[APIFY] Revisit fetched ${items.length} posts`);
  return items;
}

/** Extract YouTube video IDs from an APIFY post object */
export function extractYouTubeLinks(post) {
  const sources = [
    ...(post.links || []),
    post.text || '',
    post.url || '',
  ];
  const found = new Set();
  for (const src of sources) {
    const text = typeof src === 'string' ? src : src.url || '';
    const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/g);
    if (m) m.forEach(u => {
      const id = u.match(/([A-Za-z0-9_-]{11})$/)?.[1];
      if (id) found.add(id);
    });
  }
  return [...found];
}
