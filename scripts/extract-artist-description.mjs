/**
 * Extracts the real singer/artist name from a production channel's video
 * description and title, without any API calls.
 *
 * Stage 1 — Description label regex (high confidence)
 *   Matches "ច្រៀង :" / "ច្រៀងដោយ :" / "Singer:" patterns common in
 *   Cambodian production channels (Town, Sunday, Ream, etc.)
 *
 * Stage 2 — Title pattern (medium confidence)
 *   Matches "Song Title - Khmer Artist - Latin Artist - Official..." format.
 */

// ច្រៀង or ច្រៀងដោយ followed by ASCII colon or Khmer ៖ (៖)
const SINGER_LABEL_RE = /(?:ច្រៀង(?:ដោយ)?|Singer|Vocal|Vocalist)\s*[:៖]\s*([^\n\r]+)/i;

// Labels that indicate the value is NOT an artist name
const NOT_ARTIST_RE = /\b(?:official|mv|music\s*video|audio|lyric|lyric\s*video|remaster|remix|version|ver\.?)\b/i;

/**
 * Given a raw "ច្រៀង : <value>" match, extract the best display name.
 * Prefers the Latin name found inside parentheses (e.g. "Hang Sovannarith")
 * over the Khmer name, since the Artists sheet uses Latin names.
 */
function parseArtistLine(raw) {
  // Strip trailing hashtags, newlines, and whitespace
  const text = raw.replace(/#.*/, '').trim();

  // Look for a Latin name inside parentheses: "ហង្ស សុវណ្ណារិទ្ធ (Hang Sovannarith)"
  // Must have at least one lowercase letter to exclude "Official MV" style labels.
  const parenMatch = text.match(/\(\s*([A-Za-z][a-z][^)]{1,60})\s*\)/);
  const latinInParens = parenMatch && !NOT_ARTIST_RE.test(parenMatch[1])
    ? parenMatch[1].trim()
    : null;

  // Khmer part: strip all parenthetical content
  const khmerPart = text.replace(/\([^)]*\)/g, '').trim();

  return {
    display: latinInParens || khmerPart,
    khmer: khmerPart || null,
    latin: latinInParens || null,
  };
}

/**
 * Returns true if the candidate name is (or contains) the production channel name.
 * Prevents "ច្រៀង ៖ Town Production" from being used as an artist.
 */
function isChannelSelf(candidate, channelName) {
  if (!channelName) return false;
  const a = candidate.toLowerCase();
  const b = channelName.toLowerCase();
  // Compare first word of channel name (e.g. "town" from "Town Production")
  const channelFirst = b.split(/\s+/)[0];
  return channelFirst.length >= 4 && a.includes(channelFirst);
}

/**
 * Main export.
 *
 * @param {string} title         - YouTube video title
 * @param {string} description   - YouTube video description
 * @param {string} [channelName] - Production channel name (used to reject self-references)
 * @returns {{ artist: string|null, artistKhmer: string|null, artistLatin: string|null,
 *             confidence: 'high'|'medium'|'none', method: string }}
 */
export function extractArtistFromDescription(title, description, channelName = '') {
  const noResult = { artist: null, artistKhmer: null, artistLatin: null, confidence: 'none', method: 'none' };

  // ── Stage 1: Description label regex ────────────────────────────────────────
  if (description) {
    const match = description.match(SINGER_LABEL_RE);
    if (match) {
      const rawValue = match[1].trim();
      if (rawValue.length >= 2 && rawValue.length <= 120) {
        const { display, khmer, latin } = parseArtistLine(rawValue);
        if (display && !isChannelSelf(display, channelName)) {
          return { artist: display, artistKhmer: khmer, artistLatin: latin, confidence: 'high', method: 'desc_label' };
        }
      }
    }
  }

  // ── Stage 2: Title pattern ───────────────────────────────────────────────────
  // Matches "Khmer Song Title - Khmer Artist - Latin Artist - Official..."
  // Only applied when title contains Khmer script (production channel marker).
  if (title && /[ក-៿]/.test(title)) {
    const segments = title.split(/\s*-\s*/);
    if (segments.length >= 3) {
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i].trim();
        // Latin-only segment, 3-40 chars, no video-type keywords
        if (/^[A-Za-z][A-Za-z\s.']{2,39}$/.test(seg) && !NOT_ARTIST_RE.test(seg) && !isChannelSelf(seg, channelName)) {
          const khmerSeg = i > 0 && /[ក-៿]/.test(segments[i - 1]) ? segments[i - 1].trim() : null;
          return { artist: seg, artistKhmer: khmerSeg, artistLatin: seg, confidence: 'medium', method: 'title_pattern' };
        }
      }
    }
  }

  return noResult;
}
