import fetch from 'node-fetch';

const APPLE_MUSIC_URL = 'https://rss.marketingtools.apple.com/api/v2/kh/music/most-played/100/songs.json';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9,km;q=0.8',
  'Cache-Control': 'no-cache',
};

async function withRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function fetchAppleMusicRanking() {
  const data = await withRetry(async () => {
    const res = await fetch(APPLE_MUSIC_URL, { headers: HEADERS, timeout: 15000 });
    if (!res.ok) throw new Error(`Apple Music RSS returned HTTP ${res.status}`);
    return res.json();
  });

  const results = data?.feed?.results;
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Apple Music RSS: no results in feed');
  }

  const today = new Date().toISOString().split('T')[0];

  return results.map((item, idx) => ({
    rank: idx + 1,
    platform: 'apple_music',
    track_id: String(item.id || ''),
    title: item.name || '',
    artist: item.artistName || '',
    url: item.url || '',
    artwork_url: (item.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
    album: '',
    genre: item.genres?.[0]?.name || '',
    date: today,
    youtube_video_id: null,
    collected_at: new Date().toISOString(),
  }));
}
