import dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleAuth } from 'google-auth-library';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;

async function testSearch(query) {
  console.log(`Testing search for: "${query}"`);

  // 0. Setup Auth
  const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const auth = new GoogleAuth({
    credentials,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  // 1. Test Embedding
  console.log("1. Generating Embedding via Vertex AI...");
  const LOCATION = 'us-central1';
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;

  const body = {
    instances: [
      {
        content: query,
        task_type: 'RETRIEVAL_QUERY'
      }
    ]
  };

  const embedRes = await fetch(url, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(body),
  });

  if (!embedRes.ok) {
    console.error("Embedding Failed:", await embedRes.text());
    return;
  }
  const embedData = await embedRes.json();
  const vector = embedData.predictions[0].embeddings.values;
  console.log("Vector generated (first 5 values):", vector.slice(0, 5));

  // 2. Test BigQuery
  console.log("2. Querying BigQuery...");
  const bq = new BigQuery({
    projectId: PROJECT_ID || credentials.project_id,
    credentials,
  });

  const sql = `
    WITH similarity_search AS (
      SELECT 
        videoId,
        (1 - ML.DISTANCE(vector, @query_vector, 'COSINE')) as similarity
      FROM \`${PROJECT_ID}.heat_ranking.songs_vector\`
    )
    SELECT 
      m.videoId, m.artist, m.title, s.similarity
    FROM similarity_search s
    JOIN \`${PROJECT_ID}.heat_ranking.songs_master\` m ON s.videoId = m.videoId
    WHERE s.similarity > 0.1
    ORDER BY s.similarity DESC
    LIMIT 5
  `;

  try {
    const [rows] = await bq.query({
      query: sql,
      params: { query_vector: vector },
      types: { query_vector: ['FLOAT64'] }
    });
    console.log("Results found:", rows.length);
    rows.forEach(r => console.log(`- [${Math.round(r.similarity * 100)}%] ${r.artist} - ${r.title}`));
  } catch (err) {
    console.error("BigQuery Search Failed:", err.message);
  }
}

testSearch("Dance Music");
