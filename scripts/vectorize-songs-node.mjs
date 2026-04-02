import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus, clearProcessStatus } from './process-tracker.mjs';
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

async function getEmbedding(text) {
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
    console.warn('Rate limit hit, waiting 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return getEmbedding(text); // Simple retry
  } else {
    throw new Error(`Vertex AI Error: ${JSON.stringify(data)}`);
  }
}

async function vectorizeSongs() {
  console.log('--- Song Vectorization Started (Vertex AI) ---');

  // 1. Identify songs that need vectorization
  const query = `
    SELECT s.videoId, s.artist, s.title
    FROM \`${DATASET_ID}.${TABLE_SONGS}\` AS s
    LEFT JOIN \`${DATASET_ID}.${TABLE_VECTORS}\` AS v
    ON s.videoId = v.videoId
    WHERE v.videoId IS NULL
    LIMIT 10
  `;
  const [rows] = await bq.query(query);

  if (rows.length === 0) {
    console.log('No new songs to vectorize.');
    return;
  }

  console.log(`Found ${rows.length} songs to vectorize.`);

  const vectorRows = [];
  for (const row of rows) {
    const { videoId, artist, title } = row;
    console.log(`Processing: ${title} by ${artist} (${videoId})`);

    const sourceText = `Title: ${title}\nArtist: ${artist}\nContext: Music video ranking on HEAT platform.`;

    try {
      const embedding = await getEmbedding(sourceText);

      vectorRows.push({
        videoId,
        embedding,
        source_text: sourceText,
        last_updated: new Date().toISOString()
      });

      // Throttling to avoid 429
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(`Failed to vectorize ${videoId}:`, error.message);
    }
  }

  // 2. Insert into BigQuery
  if (vectorRows.length > 0) {
    console.log(`Inserting ${vectorRows.length} vectors into BigQuery...`);
    await bq.dataset(DATASET_ID).table(TABLE_VECTORS).insert(vectorRows);
    console.log('Insertion complete.');
  }

  console.log('--- Song Vectorization Completed ---');
  updateProcessStatus('Daily Vectorization', idsToVectorize.length, idsToVectorize.length, 'completed');
  await sendTelegramNotification(`🧠 <b>AIベクトル化完了</b>\n新規 ${vectorRows.length} 曲のインデックスを作成しました。`);
  setTimeout(clearProcessStatus, 30000); // Clear after 30 seconds
}

vectorizeSongs().catch(console.error);
