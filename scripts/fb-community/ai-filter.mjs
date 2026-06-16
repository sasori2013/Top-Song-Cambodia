import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

const LOCATION = 'us-central1';
const MODEL    = 'gemini-2.5-flash';

function createAuth() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new GoogleAuth({ credentials, scopes: 'https://www.googleapis.com/auth/cloud-platform' });
}

/**
 * Classify a single FB post via Gemini Flash.
 * Returns { category, confidence } — falls back to heuristic on error.
 */
export async function classifyPost(postText, youtubeLinks = []) {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const prompt =
    `Facebook post from a Khmer music artist page:\n\n` +
    `Text: ${postText?.slice(0, 800) || '(empty)'}\n` +
    `YouTube links: ${youtubeLinks.length > 0 ? youtubeLinks.join(', ') : 'none'}\n\n` +
    `Classify into exactly one category:\n` +
    `- new_release: Announces a new song or music video (FB native video or YT link)\n` +
    `- yt_share: Shares a YouTube link to existing content (not a new release)\n` +
    `- promo: Concert, event, or other non-release promotion\n` +
    `- unrelated: Not music-related\n\n` +
    `Reply with JSON only: {"category":"...","confidence":0.0}`;

  try {
    const auth = createAuth();
    const token = await auth.getAccessToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0 },
      }),
    });

    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(raw.match(/\{.*\}/s)?.[0] || '{}');
    return {
      category:   parsed.category   || 'unrelated',
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (e) {
    console.warn(`[AI] Classification failed (${e.message}), using heuristic`);
    return heuristicClassify(postText, youtubeLinks);
  }
}

function heuristicClassify(text, youtubeLinks = []) {
  if (youtubeLinks.length > 0) return { category: 'yt_share', confidence: 0.7 };
  if (/new song|mv|official|release|បទ|ចម្រៀង/i.test(text || '')) {
    return { category: 'new_release', confidence: 0.6 };
  }
  return { category: 'unrelated', confidence: 0.5 };
}

/**
 * Classify an array of normalized posts.
 * Returns same array with ai_category / ai_confidence added.
 */
export async function classifyPosts(posts) {
  const results = [];
  for (const post of posts) {
    const { category, confidence } = await classifyPost(post.post_text, post.youtube_links);
    results.push({ ...post, ai_category: category, ai_confidence: confidence });
    await new Promise(r => setTimeout(r, 200)); // avoid rate limits
  }
  return results;
}
