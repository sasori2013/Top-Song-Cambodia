import { getArtistArchive } from '../src/lib/bigquery.ts';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

async function test() {
  console.log('Testing getArtistArchive for VannDa...');
  const songs = await getArtistArchive('វណ្ណដា-VannDa Official');
  console.log(`Found ${songs.length} songs.`);
  if (songs.length > 0) {
    console.log('Latest 3 songs:');
    console.log(songs.slice(0, 3));
  }
}

test().catch(console.error);
