import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function checkFailedArtistsRecent() {
  const artists = [
    { name: 'Chhay Vireak Yuth', channelId: 'UCQk42lEckO8RsCzAga9O2Yg' },
    { name: 'AK-K', channelId: 'UCr5z-5esjF9WpGV0nvnKNlA' }
  ];

  for (const artist of artists) {
    console.log(`Checking ${artist.name} (${artist.channelId})...`);
    const res = await youtube.search.list({
      part: ['snippet'],
      channelId: artist.channelId,
      maxResults: 5,
      order: 'date',
      type: ['video']
    });

    (res.data.items || []).forEach(it => {
      console.log(`- ${it.snippet.publishedAt} | ${it.snippet.title} | ${it.id.videoId}`);
    });
  }
}

checkFailedArtistsRecent().catch(console.error);
