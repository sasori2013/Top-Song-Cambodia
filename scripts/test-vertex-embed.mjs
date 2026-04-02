import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = 'us-central1';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

async function testVertexEmbed() {
  console.log('Testing Vertex AI Embeddings...');
  const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION, googleAuthOptions: { credentials } });
  const model = vertexAI.preview.getGenerativeModel({ model: 'text-embedding-004' });

  const request = {
    instances: [{ content: 'Hello world' }],
  };

  try {
    const result = await model.embedContent(request);
    console.log('Vertex AI Result:', result.predictions[0].embeddings.values.length, 'dimensions');
  } catch (error) {
    console.error('Vertex AI Error:', error.message);
  }
}

testVertexEmbed().catch(console.error);
