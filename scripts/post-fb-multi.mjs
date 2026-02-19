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
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwcCVTf4NPMO2NHdqeQ5OolplixthM4vUwYeyCKJaA1vpp48dG9NBwGG0wI781bfrxBkg/exec';
const OG_BASE_URL = 'http://localhost:3000/api/og/ranking';

async function postMultiCardToFacebook() {
    console.log('--- Facebook Multi-Card Posting Script ---');

    if (!FB_ACCESS_TOKEN) {
        console.error('Error: FB_ACCESS_TOKEN is not defined in .env.local');
        process.exit(1);
    }

    try {
        // 1. 最新のランキングデータを取得
        console.log('Fetching ranking data from GAS...');
        const gasRes = await fetch(GAS_API_URL);
        const gasData = await gasRes.json();
        const ranking = gasData.ranking;
        const dateStr = gasData.updatedAt ? new Date(gasData.updatedAt).toLocaleDateString('ja-JP').replace(/\//g, ' ') : '2026 02 18';

        if (!ranking || ranking.length < 10) {
            throw new Error('Ranking data is insufficient (< 10 items)');
        }

        // 2. 画像生成タスクの定義
        const cardTasks = [
            {
                // Card 1: Rank 1
                url: `${OG_BASE_URL}?template=rank1&rank=1&artist=${encodeURIComponent(ranking[0].artist)}&title=${encodeURIComponent(ranking[0].title)}&heatPoint=${ranking[0].heatScore}&growth=${ranking[0].growth}&views=${formatViews(ranking[0].views)}&engagement=${ranking[0].engagement}&date=${encodeURIComponent(dateStr)}`,
                message: `NO.1: ${ranking[0].artist} - ${ranking[0].title}`
            },
            {
                // Card 2: Rank 2-4
                url: `${OG_BASE_URL}?template=multi&items=${encodeURIComponent(JSON.stringify(ranking.slice(1, 4)))}&date=${encodeURIComponent(dateStr)}`,
                message: `RANK 2-4`
            },
            {
                // Card 3: Rank 5-7
                url: `${OG_BASE_URL}?template=multi&items=${encodeURIComponent(JSON.stringify(ranking.slice(4, 7)))}&date=${encodeURIComponent(dateStr)}`,
                message: `RANK 5-7`
            },
            {
                // Card 4: Rank 8-10
                url: `${OG_BASE_URL}?template=multi&items=${encodeURIComponent(JSON.stringify(ranking.slice(7, 10)))}&date=${encodeURIComponent(dateStr)}`,
                message: `RANK 8-10`
            }
        ];

        // 3. 画像を生成してFacebookに「未公開写真」としてアップロード
        console.log('Uploading images to Facebook...');
        const mediaIds = [];
        for (const task of cardTasks) {
            console.log(`Generating & Uploading: ${task.message}`);
            const ogRes = await fetch(task.url);
            if (!ogRes.ok) throw new Error(`OG Generation failed for ${task.message}`);
            const buffer = await ogRes.buffer();

            const formData = new FormData();
            formData.append('source', buffer, { filename: 'card.png', contentType: 'image/png' });
            formData.append('published', 'false'); // まだ公開しない
            formData.append('access_token', FB_ACCESS_TOKEN);

            const uploadRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/photos`, {
                method: 'POST',
                body: formData
            });
            const uploadResult = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadResult)}`);

            mediaIds.push(uploadResult.id);
        }

        // 4. アップロードした複数の写真を紐付けて1つの投稿として公開
        console.log('Finalizing post on Facebook...');
        const postMessage = `Cambodia Daily Music Ranking | ${dateStr}\n\nTOP 10 Artists of the day are here! 🇰🇭🔥\n\n#HEAT #CambodiaMusic #DailyRanking #VannDa #NORITH`;

        const attachedMedia = mediaIds.map(id => `{"media_fbid":"${id}"}`);

        const finalizeRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: postMessage,
                attached_media: attachedMedia,
                access_token: FB_ACCESS_TOKEN
            })
        });

        const finalizeResult = await finalizeRes.json();

        if (finalizeRes.ok) {
            console.log('✅ Successfully posted multi-card update to Facebook!');
            console.log('Post ID:', finalizeResult.id);
        } else {
            console.error('❌ Failed to finalize Facebook post:');
            console.error(JSON.stringify(finalizeResult, null, 2));
        }

    } catch (error) {
        console.error('❌ Error occurred:');
        console.error(error.message);
    }
}

function formatViews(views) {
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(0) + 'K';
    return views.toString();
}

postMultiCardToFacebook();
