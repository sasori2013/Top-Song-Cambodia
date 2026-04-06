import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function checkDuration(videoId) {
  try {
    const res = await youtube.videos.list({
      part: ['contentDetails', 'snippet'],
      id: [videoId]
    });
    const item = res.data.items[0];
    console.log(`Title: ${item.snippet.title}`);
    console.log(`Duration: ${item.contentDetails.duration}`);
    console.log(`PublishedAt: ${item.snippet.publishedAt}`);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkDuration('dryShmzXrgo');
