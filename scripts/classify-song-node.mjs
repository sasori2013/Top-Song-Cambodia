import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
const auth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

function isSpamOrBot(text) {
  const textWithoutEmojis = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
  if (textWithoutEmojis.length === 0) return true;
  if (/https?:\/\//.test(text)) return true;
  const lower = text.toLowerCase();
  const spamKeywords = ["subscribe", "my channel", "check out my", "click my profile", "link in bio"];
  if (spamKeywords.some(kw => lower.includes(kw))) return true;
  return false;
}

export async function classifySong(videoId, title, description, isLabel = false) {
  console.log(`Classifying video ${videoId}: ${title} ${isLabel ? '(Label Mode)' : ''}`);

  try {
    // 1. Fetch top comments (Fetch 100, keep up to 50 valid ones)
    let commentsText = "No comments available.";
    try {
      const resComments = await youtube.commentThreads.list({
        part: ['snippet'],
        videoId: videoId,
        maxResults: 100,
        order: 'relevance'
      });
      
      const validComments = [];
      const items = resComments.data.items || [];
      for (const it of items) {
        const cText = it.snippet.topLevelComment.snippet.textOriginal;
        if (!isSpamOrBot(cText)) {
          validComments.push(cText);
          if (validComments.length >= 50) break;
        }
      }
      
      if (validComments.length > 0) {
         // Join up to 50 comments
        commentsText = validComments.join('\n---\n');
      }
    } catch (err) {
      console.warn(`  Warning: Could not fetch comments for ${videoId}: ${err.message}`);
    }

    // 2. Prepare AI Prompt
    const artistTask = isLabel 
      ? `3. detectedArtist: This video is from a music production channel. Extract the REAL singer/artist name (e.g., from "ចម្រៀង [Artist]", "[Artist] - [Title]"). If unknown, return "".`
      : `3. detectedArtist: Return "".`;

    const prompt = `
Analyze the following Cambodian music video data and categorize it in clear English.

VIDEO INFO:
Title: ${title}
Description: ${description}

TOP COMMENTS:
${commentsText}

INSTRUCTIONS:
Determine the following fields:
1. eventTag: Identify if this is for a specific event like "Khmer New Year 2026", "Cambodian Idol S4", "The Voice Cambodia", or "None". (English)
2. category: Categorize as "Original MV", "Audition Performance", "Live Concert", "Dance Motion", or "Other". (English)
${artistTask}

Output only a valid JSON object:
{
  "eventTag": "...", 
  "category": "...",
  "detectedArtist": "...",
  "reason": "Brief explanation in English"
}
`;

    // 3. Call Vertex AI
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.2 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Clean JSON output if AI adds markdown backticks
    text = text.replace(/```json|```/g, '').trim();
    
    const classification = JSON.parse(text);
    console.log(`  Result: ${classification.category} | ${classification.eventTag}`);
    return { ...classification, topComments: commentsText };

  } catch (error) {
    console.error(`  Classification error for ${videoId}:`, error.message);
    return { eventTag: "None", category: "Other", reason: "Error: " + error.message, topComments: "Error fetching" };
  }
}

// Optional: Test if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const testId = process.argv[2] || 'VannDa-KNY-Test'; // Replace with a real ID for testing
    classifySong(testId, "Sample KNY Song 2026", "Happy Khmer New Year to everyone! Enjoy the dance.").then(console.log);
}
