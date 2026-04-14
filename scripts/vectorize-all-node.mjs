import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';

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
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

// Throttling / Concurrency (Strict mode to avoid 429)
const CONCURRENCY = 1;
const BATCH_INSERT_SIZE = 50;
const RETRY_MAX = 5;

const LOCATIONS = ['us-central1', 'asia-northeast1', 'europe-west1', 'us-east4'];
let currentLocIndex = 0;

async function getEmbedding(text, retryCount = 0) {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const location = LOCATIONS[currentLocIndex % LOCATIONS.length];
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${location}/publishers/google/models/text-embedding-004:predict`;
  
  const body = {
    instances: [{ content: text, task_type: 'RETRIEVAL_DOCUMENT' }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.predictions && data.predictions[0]) {
      return data.predictions[0].embeddings.values;
    } else if (data.error && data.error.code === 429) {
      if (retryCount < RETRY_MAX) {
        currentLocIndex++; // Try different location on next retry
        const delay = Math.pow(2, retryCount) * 10000 + Math.random() * 5000;
        console.warn(`  [429] ${location} limit hit. Rotating to ${LOCATIONS[currentLocIndex % LOCATIONS.length]}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
        return getEmbedding(text, retryCount + 1);
      }
    }
    throw new Error(`Vertex AI Error: ${JSON.stringify(data)}`);
  } catch (error) {
    if (retryCount < RETRY_MAX) {
      await new Promise(r => setTimeout(r, 5000));
      return getEmbedding(text, retryCount + 1);
    }
    throw error;
  }
}

async function vectorizeAll() {
  console.warn('⚠️ Vectorization is currently PAUSED by user request.');
  return;
  console.log('--- Mass Song Vectorization (Safe Mode) Started ---');
  await sendTelegramNotification('🧠 <b>大規模ベクトル化 (Safe Mode)</b> を開始します...');

  // 1. Fetch unvectorized songs
  const query = `
    SELECT s.videoId, s.artist, s.title
    FROM \`${DATASET_ID}.${TABLE_SONGS}\` AS s
    LEFT JOIN \`${DATASET_ID}.${TABLE_VECTORS}\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL
    ORDER BY s.publishedAt DESC
  `;
  const [rows] = await bq.query(query);

  if (rows.length === 0) {
    console.log('No new songs to vectorize.');
    return;
  }

  console.log(`Found ${rows.length} songs to vectorize. Processing 1-by-1 with 2s delay.`);

  let completedCount = 0;
  let currentBatch = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { videoId, artist, title } = row;
    const sourceText = `Title: ${title}\nArtist: ${artist}\nContext: Music video ranking on HEAT platform.`;
    
    try {
      const embedding = await getEmbedding(sourceText);
      currentBatch.push({
        videoId,
        embedding,
        source_text: sourceText,
        last_updated: new Date().toISOString()
      });
      process.stdout.write('.'); // Progress dot
    } catch (err) {
      console.error(`\n  Failed ${videoId}: ${err.message}`);
    }

    // Periodic BQ insertion (Checkpointing)
    if (currentBatch.length >= BATCH_INSERT_SIZE || i === rows.length - 1) {
      if (currentBatch.length > 0) {
        console.log(`\n  Writing batch of ${currentBatch.length} (Total: ${i + 1}/${rows.length})...`);
        await bq.dataset(DATASET_ID).table(TABLE_VECTORS).insert(currentBatch);
        currentBatch = [];
      }
      await updateProcessStatus('Vectorization: Continuous', i + 1, rows.length);
    }

    // Safety sleep between requests (Ultra safe for restricted projects)
    await new Promise(r => setTimeout(r, 4000));
    
    if ((i + 1) % 100 === 0) {
      console.log(`\n--- Progress: ${i + 1}/${rows.length} ---`);
    }
  }

  console.log(`--- Vectorization Completed ---`);
  await sendTelegramNotification(`✅ <b>全楽曲ベクトル化完了</b>\n新しく作成したインデックスの同期が終わりました。`);
}

vectorizeAll().catch(async (error) => {
  console.error(error);
  await sendTelegramNotification(`⚠️ <b>ベクトル化エラー</b>\n<code>${error.message}</code>`);
});
