import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

async function testEmbedding() {
  console.log('Testing Vertex AI Embeddings API (REST)...');
  try {
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

    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;

    const body = {
      instances: [{ content: 'Hi' }],
      parameters: { task_type: 'RETRIEVAL_QUERY' }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (response.ok) {
        console.log('✅ Embedding Success! Location and Auth are correct.');
    } else {
        console.log('❌ Embedding Failed:', data.error?.message || response.statusText);
        console.log('Full Error:', JSON.stringify(data));
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

testEmbedding().catch(console.error);
