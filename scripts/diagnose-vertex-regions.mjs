import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

async function testRegion(region) {
  console.log(`\nTesting region: ${region}...`);
  try {
    const auth = new GoogleAuth({
      credentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${region}/publishers/google/models/gemini-1.5-flash:generateContent`;

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
      console.log(`✅ Success in ${region}!`);
      return true;
    } else {
      console.log(`❌ Failed in ${region}:`, data.error?.message);
      return false;
    }
  } catch (error) {
    return false;
  }
}

async function runTests() {
  const regions = ['us-central1', 'us-east4', 'asia-northeast1', 'europe-west9'];
  for (const r of regions) {
    if (await testRegion(r)) break;
  }
}

runTests().catch(console.error);
