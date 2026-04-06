import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

async function testV1Beta1() {
  console.log('Testing Vertex AI with v1beta1 endpoint...');
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

    // Use v1beta1 instead of v1
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-1.5-flash:generateContent`;

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
        console.log('✅ Success in v1beta1!');
        console.log('Response:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
        console.log('❌ Failed in v1beta1:', data.error?.message || response.statusText);
        console.log('Full Error:', JSON.stringify(data));
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

testV1Beta1().catch(console.error);
