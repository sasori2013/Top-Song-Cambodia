import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function traceDiscovery(artistName, channelId) {
  console.log(`Trace Discovery for ${artistName} (${channelId})`);
  
  // Try Search API (The new logic)
  try {
    const res = await youtube.search.list({
      part: ['snippet'],
      channelId: channelId,
      maxResults: 10,
      order: 'date',
      type: ['video']
    });
    console.log('Search Results (Top 5):');
    (res.data.items || []).slice(0, 5).forEach(it => {
      console.log(` - [${it.snippet.publishedAt}] ${it.snippet.title} (ID: ${it.id.videoId})`);
    });
  } catch (e) {
    console.error('Search API Error:', e.message);
  }

  // Try Playlist API (The old logic)
  try {
    const resChan = await youtube.channels.list({
      part: ['contentDetails'],
      id: [channelId]
    });
    const uploadsId = resChan.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (uploadsId) {
      const resPl = await youtube.playlistItems.list({
        part: ['snippet'],
        playlistId: uploadsId,
        maxResults: 10
      });
      console.log('Playlist (Uploads) Results (Top 5):');
      (resPl.data.items || []).slice(0, 5).forEach(it => {
        console.log(` - [${it.snippet.publishedAt}] ${it.snippet.title} (ID: ${it.snippet.resourceId.videoId})`);
      });
    }
  } catch (e) {
    console.error('Playlist API Error:', e.message);
  }
}

// Check Galaxy Navatra (Major one) - actually let's check VannDa and Galaxy
traceDiscovery('VannDa', 'UCrmidtzX3ZPVxYRjTI6V6tA');
// traceDiscovery('Galaxy Navatra', 'UC1fV_nCAt7Z3O2eN2I0Kxyg'); // Need to verify ID
