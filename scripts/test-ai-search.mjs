import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';
const DATASET_ID = 'heat_ranking';
const TABLE_VECTORS = 'songs_vector';
const TABLE_SONGS = 'songs_master';

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

async function getQueryEmbedding(text) {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;

  const body = {
    instances: [
      {
        content: text,
        task_type: 'RETRIEVAL_QUERY' // Query specific task type
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
  } else {
    throw new Error(`Vertex AI Error: ${JSON.stringify(data)}`);
  }
}

async function searchSongs(userQuery) {
  console.log(`\n🔎 [AI Search] Query: "${userQuery}"`);
  
  // 1. Convert user's natural language to a vector
  const queryVector = await getQueryEmbedding(userQuery);

  // 2. Perform Vector Search in BigQuery
  // We use Euclidean distance (lower is closer)
  const bqQuery = `
    SELECT 
      v.videoId, 
      s.title, 
      s.artist,
      (SELECT SUM(a*b) / (SQRT(SUM(a*a)) * SQRT(SUM(b*b))) 
       FROM UNNEST(v.embedding) a WITH OFFSET pos
       JOIN UNNEST(@queryVector) b WITH OFFSET pos2 ON pos = pos2
      ) as cosine_similarity
    FROM \`${DATASET_ID}.${TABLE_VECTORS}\` v
    JOIN \`${DATASET_ID}.${TABLE_SONGS}\` s ON v.videoId = s.videoId
    ORDER BY cosine_similarity DESC
    LIMIT 5
  `;

  const options = {
    query: bqQuery,
    params: { queryVector },
  };

  const [results] = await bq.query(options);

  console.log('--- Search Results ---');
  results.forEach((r, i) => {
    console.log(`${i+1}. [Score: ${(r.cosine_similarity * 100).toFixed(1)}%] ${r.title} - ${r.artist}`);
  });
}

// 複数のテストクエリを実行
const testQueries = [
  'ダンスがしたくなるノリの良い曲',
  '落ち着いた雰囲気のメロディ',
  'Cambo Rapper'
];

async function runTests() {
  for (const q of testQueries) {
    await searchSongs(q);
    await new Promise(r => setTimeout(r, 2000)); // Rate limit safety
  }
}

runTests().catch(console.error);
