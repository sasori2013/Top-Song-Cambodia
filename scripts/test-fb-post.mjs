import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env.local から環境変数を読み込む
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const PAGE_ID = '971418716059046'; // HEAT - Cambodia Music INDEX
const OG_API_URL = 'http://localhost:3000/api/og/ranking';

async function postToFacebook() {
    console.log('--- Facebook Test Post Script ---');

    if (!FB_ACCESS_TOKEN) {
        console.error('Error: FB_ACCESS_TOKEN is not defined in .env.local');
        process.exit(1);
    }

    try {
        // 1. OG画像を取得
        console.log(`Fetching OG image from: ${OG_API_URL}`);
        const ogResponse = await fetch(OG_API_URL);
        if (!ogResponse.ok) {
            throw new Error(`Failed to fetch OG image: ${ogResponse.statusText}`);
        }
        const imageBuffer = await ogResponse.buffer();
        console.log('Successfully fetched OG image.');

        // 2. Facebook Graph API へのリクエスト準備
        console.log(`Posting to Facebook Page (ID: ${PAGE_ID})...`);
        const formData = new FormData();
        formData.append('source', imageBuffer, {
            filename: 'ranking.png',
            contentType: 'image/png'
        });
        formData.append('message', '今日の1位: TEP PISETH - លក្ខិណា\n#HEAT #CambodiaMusic #Ranking');
        formData.append('access_token', FB_ACCESS_TOKEN);

        // 3. 投稿実行
        const fbResponse = await fetch(`https://graph.facebook.com/${PAGE_ID}/photos`, {
            method: 'POST',
            body: formData
        });

        const result = await fbResponse.json();

        if (fbResponse.ok) {
            console.log('✅ Successfully posted to Facebook!');
            console.log('Post ID:', result.id);
            console.log('Post URL:', `https://www.facebook.com/${result.id}`);
        } else {
            console.error('❌ Failed to post to Facebook:');
            console.error(JSON.stringify(result, null, 2));
        }
    } catch (error) {
        console.error('❌ An unexpected error occurred:');
        console.error(error.message);
    }
}

postToFacebook();
