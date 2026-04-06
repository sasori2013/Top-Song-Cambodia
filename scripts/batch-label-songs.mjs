import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { classifySong } from './classify-song-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

/**
 * Fast classification without fetching comments (Phase 2) using Vertex AI
 */
async function classifySongFast(title, description) {
  try {
    const prompt = `
Analyze the following Cambodian music video and categorize it in clear, standard English.
Title: ${title}
Description: ${description}

Output ONLY a valid JSON object (Values MUST be in English):
{
  "eventTag": "Khmer New Year 2026", "Cambodian Idol S4", etc. or "None",
  "category": "Original MV", "Audition Performance", "Live Concert", "Dance Motion", or "Other",
  "reason": "English explanation"
}
`;
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.1 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    return { eventTag: "None", category: "Other", reason: "Error: " + e.message };
  }
}

async function runBatchLabeling() {
  console.log('--- Batch Labeling System Started ---');
  
  // 1. Fetch unlabeled songs
  const queryArr = await bq.query(`
    SELECT videoId, title, artist, publishedAt 
    FROM \`heat_ranking.songs_master\` 
    WHERE eventTag IS NULL 
    ORDER BY publishedAt DESC
  `);
  const rows = queryArr[0];
  console.log(`Found ${rows.length} songs to label.`);

  const recentThreshold = new Date('2026-03-01');
  const BATCH_SIZE = 20;

  for (let i = 0; i < rows.length; i++) {
    const song = rows[i];
    const isRecent = new Date(song.publishedAt.value || song.publishedAt) >= recentThreshold;
    
    console.log(`[${i+1}/${rows.length}] ${isRecent ? 'Precise' : 'Fast'} Mode: ${song.title}`);
    
    let classification;
    if (isRecent) {
      classification = await classifySong(song.videoId, song.title, ''); // Logic fetched from classify-song-node
    } else {
      classification = await classifySongFast(song.title, '');
    }

    // Update BQ immediately for safety (to allow resuming)
    const updateSql = `
      UPDATE \`heat_ranking.songs_master\`
      SET 
        eventTag = @eventTag, 
        category = @category, 
        classificationSource = 'AI'
      WHERE videoId = @videoId
    `;
    
    await bq.query({
      query: updateSql,
      params: { 
        eventTag: classification.eventTag || 'None', 
        category: classification.category || 'Other',
        videoId: song.videoId 
      }
    });

    // Mandatory sleep to avoid Gemini/BQ quotas
    await new Promise(r => setTimeout(r, isRecent ? 1000 : 500));
  }

  console.log('--- Batch Labeling Completed ---');
}

runBatchLabeling().catch(console.error);
