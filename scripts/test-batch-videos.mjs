import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function testBatch() {
  const ids = ['dryShmzXrgo', 'rLa90noLvdk'];
  console.log('Fetching batch:', ids);
  const res = await youtube.videos.list({
    part: ['snippet', 'contentDetails'],
    id: ids
  });
  console.log('Items returned:', res.data.items.length);
  res.data.items.forEach(it => console.log(` - ${it.id}: ${it.snippet.title}`));
}

testBatch();
