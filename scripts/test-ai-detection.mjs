import { classifySong } from './classify-song-node.mjs';

async function test() {
  const videoId = 'gY-6Rt5MyLI';
  const title = 'មួយកំប៉ុងពីរកំប៉ុង - នាង គន្ធា ( Official MV )';
  const description = 'Galaxy Navatra Production... Singer: នាង គន្ធា';
  
  console.log('--- Testing AI Artist Detection ---');
  const result = await classifySong(videoId, title, description, true);
  console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
