import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus, clearProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';
const TABLE_VECTORS = 'songs_vector';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function getEmbedding(text, retryCount = 0) {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;

  const body = {
    instances: [
      {
        content: text,
        task_type: 'RETRIEVAL_DOCUMENT'
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (data.predictions && data.predictions[0]) {
    return data.predictions[0].embeddings.values;
  } else if (data.error && data.error.code === 429) {
    if (retryCount >= 3) {
      throw new Error(`Vertex AI Rate Limit Exceeded after 3 retries.`);
    }
    const waitTime = Math.pow(2, retryCount) * 5000;
    console.warn(`Rate limit hit, waiting ${waitTime/1000} seconds... (Retry ${retryCount + 1})`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return getEmbedding(text, retryCount + 1);
  } else {
    throw new Error(`Vertex AI Error: ${JSON.stringify(data)}`);
  }
}

async function vectorizeSongs() {
  console.warn('⚠️ Vectorization is currently PAUSED by user request.');
  return;
  console.log('--- Song Vectorization Started (Vertex AI) ---');

  // 1. Identify songs that need vectorization
  // IMPORTANT: Only vectorize songs that have BOTH description AND topComments.
  // This prevents double-work: background-metadata-fetch.mjs fills these fields first,
  // then vectorization runs with complete data (no re-vectorization needed).
  // New songs are always vectorized immediately since classifySong() already fetches comments.
  const query = `
    SELECT s.videoId, s.artist, s.title, s.description, s.topComments, s.eventTag, s.category, s.analyzedReason
    FROM \`${DATASET_ID}.${TABLE_SONGS}\` AS s
    LEFT JOIN \`${DATASET_ID}.${TABLE_VECTORS}\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL
      AND s.description IS NOT NULL AND s.description != ''
      AND s.topComments IS NOT NULL AND s.topComments != ''
    LIMIT 1000
  `;
  const [rows] = await bq.query(query);

  if (rows.length === 0) {
    console.log('No new songs to vectorize.');
    return;
  }

  console.log(`Found ${rows.length} songs to vectorize.`);

  const BATCH_SIZE = 10;
  console.log(`Processing ${rows.length} songs in chunks of ${BATCH_SIZE}...`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    console.log(`[Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(rows.length/BATCH_SIZE)}] AI Vectorizing ${chunk.length} songs...`);

    const batchVectors = [];
    const results = await Promise.all(chunk.map(async (row) => {
      const { videoId, artist, title, description, topComments, eventTag, category, analyzedReason } = row;
      const cleanDesc = (description || '').substring(0, 500).replace(/\n/g, ' ');
      const cleanComments = (topComments || '').substring(0, 500).replace(/\n/g, ' ');
      const sourceText = `Title: ${title}\nArtist: ${artist}\nCategory: ${category || 'Unknown'}\nEvent: ${eventTag || 'None'}\nDescription: ${cleanDesc}\nComments: ${cleanComments}\nAI Insight: ${analyzedReason || ''}`.trim();
      try {
        const embedding = await getEmbedding(sourceText);
        return {
          videoId,
          embedding,
          source_text: sourceText,
          last_updated: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Failed to vectorize ${videoId}:`, error.message);
        return null;
      }
    }));

    const successfulResults = results.filter(r => r !== null);
    if (successfulResults.length > 0) {
      console.log(`  Writing ${successfulResults.length} vectors to BigQuery...`);
      await bq.dataset(DATASET_ID).table(TABLE_VECTORS).insert(successfulResults);
    }

    console.log(`  ✅ ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} 完了 (${Math.round(Math.min(i + BATCH_SIZE, rows.length)/rows.length*100)}%)`);

    // Throttling: 50 per batch * 2s gap = ~1500 req / minute? No.
    // 50 songs every 2 seconds = 25 songs / sec = 1500 RPM.
    // Vertex AI default PAID quota for text-embedding is usually 3000 RPM.
    // To be safe (250 RPM is often the FREE tier limit, but we have credit),
    // let's use 5 seconds between batches to be absolutely safe (50 * 12 = 600 RPM).
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log('--- Song Vectorization (High-Speed) Completed ---');
  // await updateProcessStatus('Daily Vectorization', rows.length, rows.length, 'completed');
  // await sendTelegramNotification(`🧠 <b>AIベクトル化完了</b>\n全曲のインデックス作成に成功しました。`);
  setTimeout(clearProcessStatus, 30000); // Clear after 30 seconds
}

vectorizeSongs().catch(async (error) => {
  console.error(error);
  await sendTelegramNotification(`⚠️ <b>AIベクトル化エラー</b>\n<code>${error.message}</code>`);
});
