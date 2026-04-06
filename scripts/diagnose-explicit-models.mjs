import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

async function testExplicitModel(modelName) {
  console.log(`Testing with model: ${modelName}...`);
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

    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${modelName}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] }),
    });

    const data = await response.json();
    if (response.ok) {
        console.log(`✅ Success with ${modelName}!`);
        return true;
    } else {
        console.log(`❌ Failed with ${modelName}:`, data.error?.message);
        return false;
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
    return false;
  }
}

async function run() {
  const models = ['gemini-1.5-flash-002', 'gemini-1.5-flash-001', 'gemini-2.0-flash-001'];
  for(const m of models) {
      if(await testExplicitModel(m)) break;
  }
}

run().catch(console.error);
