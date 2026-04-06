import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY;

async function testGeminiWithYoutubeKey() {
  console.log('Testing Gemini API with YOUTUBE_API_KEY...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${YOUTUBE_KEY}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] }),
    });

    const data = await response.json();
    if (response.ok) {
        console.log('✅ Success! The YouTube API Key can use Gemini.');
        console.log('Response:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    } else {
        console.log('❌ Failed:', data.error?.message || response.statusText);
        console.log('Full Error:', JSON.stringify(data));
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

testGeminiWithYoutubeKey().catch(console.error);
