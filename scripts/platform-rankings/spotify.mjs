/**
 * Spotify Cambodia Trending — https://open.spotify.com/popular-all/trending-songs/kh
 *
 * Uses Playwright + playwright-extra stealth plugin to render the page
 * as a real browser, bypassing headless detection.
 */

import { addExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { chromium as chromiumBase } from 'playwright';

// Apply stealth plugin — hides navigator.webdriver, plugins, canvas fingerprint, etc.
const chromium = addExtra(chromiumBase);
chromium.use(StealthPlugin());

const TRENDING_URL = 'https://open.spotify.com/popular-all/trending-songs/kh';

// Rotate User-Agent across common real browsers to avoid fingerprinting
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrape(attempt = 1) {
  const ua = randomUA();

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', // hide automation flag
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: ua,
      locale: 'en-US',
      timezoneId: 'Asia/Phnom_Penh',
      viewport: { width: 1280 + Math.floor(Math.random() * 200), height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });

    // Inject extra stealth overrides at the page level
    await context.addInitScript(() => {
      // Make navigator.plugins appear non-empty (headless has 0 plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // Hide webdriver flag (belt-and-suspenders alongside stealth plugin)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();

    // Random delay before navigation (1.5–4s) — vary timing per run
    await sleep(1500 + Math.random() * 2500);

    await page.goto(TRENDING_URL, { waitUntil: 'networkidle', timeout: 45000 });

    // Wait for track cards to render
    await page.waitForSelector('[data-encore-id="card"]', { timeout: 20000 });

    // Short random pause to mimic human reading the page
    await sleep(800 + Math.random() * 1200);

    const today = new Date().toISOString().split('T')[0];

    const tracks = await page.evaluate((date) => {
      const cards = document.querySelectorAll('[data-encore-id="card"]');

      return Array.from(cards).map((card, idx) => {
        const btnEl = card.querySelector('[aria-labelledby*="card-title-spotify:track:"]');
        const labelId = btnEl?.getAttribute('aria-labelledby') || '';
        const trackIdMatch = labelId.match(/spotify:track:([A-Za-z0-9]+)/);
        const trackId = trackIdMatch ? trackIdMatch[1] : '';

        const titleEl = card.querySelector('[data-encore-id="cardTitle"]');
        const title = titleEl?.getAttribute('title') || titleEl?.innerText?.trim() || '';

        const subtitleEl = card.querySelector('[data-encore-id="cardSubtitle"]');
        const artistLinks = subtitleEl ? subtitleEl.querySelectorAll('a') : [];
        const artist = Array.from(artistLinks)
          .map(a => a.innerText.trim())
          .filter(Boolean)
          .join(', ');

        const imgEl = card.querySelector('img[data-testid="card-image"]');
        const artworkUrl = imgEl?.src || '';

        return {
          rank: idx + 1,
          platform: 'spotify',
          track_id: trackId,
          title,
          artist,
          url: trackId ? `https://open.spotify.com/track/${trackId}` : '',
          artwork_url: artworkUrl,
          album: '',
          genre: '',
          date,
          youtube_video_id: null,
          collected_at: new Date().toISOString(),
        };
      }).filter(t => t.title.length > 0);
    }, today);

    if (tracks.length === 0) {
      throw new Error('No tracks found — page structure may have changed or bot was detected');
    }

    return tracks;

  } finally {
    await browser.close();
  }
}

export async function fetchSpotifyRanking() {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[Spotify] Attempt ${attempt}/${MAX_ATTEMPTS}...`);
      const tracks = await scrape(attempt);
      console.log(`[Spotify] Extracted ${tracks.length} tracks from ${TRENDING_URL}`);
      return tracks;
    } catch (e) {
      console.warn(`[Spotify] Attempt ${attempt} failed: ${e.message}`);
      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff: 5s, 15s between retries
        const wait = 5000 * attempt + Math.random() * 3000;
        console.log(`[Spotify] Waiting ${Math.round(wait / 1000)}s before retry...`);
        await sleep(wait);
      } else {
        throw new Error(`Spotify scraping failed after ${MAX_ATTEMPTS} attempts: ${e.message}`);
      }
    }
  }
}
