import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function checkSpecificChannels() {
  const ids = [
    'UCQk42lEckO8RsCzAga9O2Yg', // Chhay Vireak Yuth
    'UCr5z-5esjF9WpGV0nvnKNlA'  // AK-K
  ];

  console.log('Checking specific channels...');
  const res = await youtube.channels.list({
    part: ['id', 'snippet', 'contentDetails'],
    id: ids
  });

  console.log(`Found ${res.data.items?.length || 0} channels.`);
  (res.data.items || []).forEach(item => {
    console.log(`- ${item.snippet.title} (${item.id})`);
    console.log(`  Uploads Playlist: ${item.contentDetails?.relatedPlaylists?.uploads || 'None'}`);
  });

  const foundIds = (res.data.items || []).map(it => it.id);
  ids.forEach(id => {
    if (!foundIds.includes(id)) {
      console.log(`- NOT FOUND: ${id}`);
    }
  });
}

checkSpecificChannels().catch(console.error);
