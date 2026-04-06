import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

async function listModels() {
  console.log(`\nListing available models for ${PROJECT_ID} in ${LOCATION}...`);
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

    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await response.json();
    if (response.ok) {
      console.log('✅ Successfully fetched models list:');
      if (data.models) {
        data.models.forEach(m => console.log(`- ${m.name}`));
      } else {
        console.log('No models found in the response.');
      }
    } else {
      console.log('❌ Failed to fetch models:', data.error?.message || response.statusText);
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

listModels().catch(console.error);
