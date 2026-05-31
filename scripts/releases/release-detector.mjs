import { createHash } from 'crypto';

/**
 * Extract album name and track number from a YouTube description.
 * Priority: first-line keyword > hashtag with album/ep > hashtag near track number.
 */
export function extractAlbumInfo(description) {
  if (!description) return { albumName: null, trackNumber: null };

  const lines = description.split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';

  // Track number: "TRACK 8" or "TRACK 08"
  const trackMatch = description.match(/\bTRACK\s+(\d+)\b/i);
  const trackNumber = trackMatch ? parseInt(trackMatch[1]) : null;

  // Priority 1: first line contains "album" or "EP"
  if (/\balbum\b|\bE\.?P\.?\b/i.test(firstLine)) {
    const albumName = firstLine
      .replace(/\s*\([^)]*\)\s*/g, '') // strip "(Disc 1)" etc.
      .replace(/\s+/g, ' ')
      .trim();
    if (albumName.length > 2) return { albumName, trackNumber };
  }

  // Priority 2: hashtag containing "album" or "EP"
  const hashMatches = [...description.matchAll(/#([A-Za-z][A-Za-z0-9_]{2,})/g)];
  for (const m of hashMatches) {
    const tag = m[1];
    if (/album|E\.?P\.?/i.test(tag)) {
      const albumName = humanizeTag(tag);
      return { albumName, trackNumber };
    }
  }

  // Priority 3: track number found → pick most prominent non-generic hashtag
  if (trackNumber !== null && hashMatches.length > 0) {
    const SKIP = new Set(['official', 'audio', 'mv', 'video', 'music', 'khmer', 'cambodia']);
    const best = hashMatches
      .map(m => m[1])
      .filter(t => t.length > 5 && !SKIP.has(t.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0];
    if (best) return { albumName: humanizeTag(best), trackNumber };
  }

  return { albumName: null, trackNumber };
}

function humanizeTag(tag) {
  return tag
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → words
    .trim();
}

export function normalizeAlbumName(name) {
  return name.toLowerCase().replace(/[^a-z0-9ក-៿]/g, '');
}

export function generateReleaseId(artistId, normalizedAlbumName) {
  return createHash('sha256')
    .update(`${artistId}__${normalizedAlbumName}`)
    .digest('hex')
    .slice(0, 32);
}

export function detectReleaseType(songCount, albumName) {
  const name = (albumName || '').toLowerCase();
  if (/\bep\b/.test(name) || (songCount >= 3 && songCount <= 5)) return 'ep';
  if (songCount >= 6 || /album/.test(name)) return 'album';
  return 'single';
}
