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
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

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
    instances: [{ content: text, task_type: 'RETRIEVAL_DOCUMENT' }]
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
    console.warn('Quota hit. Waiting 60 seconds...');
    await new Promise(r => setTimeout(r, 60000));
    return getEmbedding(text);
  } else {
    throw new Error(`Vertex AI Error: ${JSON.stringify(data)}`);
  }
}

async function bulkVectorize() {
  console.log('=== INITIAL BULK VECTORIZATION STARTED ===');
  
  const query = `
    SELECT s.videoId, s.artist, s.title
    FROM \`${DATASET_ID}.${TABLE_SONGS}\` AS s
    LEFT JOIN \`${DATASET_ID}.${TABLE_VECTORS}\` AS v ON s.videoId = v.videoId
    WHERE v.videoId IS NULL
  `;
  const [rows] = await bq.query(query);
  console.log(`Remaining songs to vectorize: ${rows.length}`);

  if (rows.length === 0) {
    console.log('All songs already vectorized.');
    clearProcessStatus();
    return;
  }

  updateProcessStatus('Initial Bulk Vectorization', 0, rows.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[${i+1}/${rows.length}] Vectorizing: ${row.title} (${row.videoId})`);
    updateProcessStatus('Initial Bulk Vectorization', i + 1, rows.length);

    const sourceText = `Title: ${row.title}\nArtist: ${row.artist}\nContext: Music video ranking on HEAT platform.`;
    
    try {
      const embedding = await getEmbedding(sourceText);
      await bq.dataset(DATASET_ID).table(TABLE_VECTORS).insert([{
        videoId: row.videoId,
        embedding,
        source_text: sourceText,
        last_updated: new Date().toISOString()
      }]);
      console.log(`  Success.`);
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }

    // Delay to respect tight quota
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('=== BULK VECTORIZATION COMPLETED ===');
  updateProcessStatus('Initial Bulk Vectorization', rows.length, rows.length, 'completed');
  await sendTelegramNotification(`🚀 <b>全件初期ベクトル化完了</b>\n合計 ${rows.length} 曲のAIインデックスを作成しました。`);
  setTimeout(clearProcessStatus, 30000); // Clear after 30 seconds
}

bulkVectorize().catch(console.error);
