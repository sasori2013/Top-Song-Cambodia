import fetch from 'node-fetch';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const PAGE_ID = '971418716059046'; // HEAT - Cambodia Music INDEX
const OG_API_URL = 'http://localhost:3000/api/og/ranking';

// Data for the 4 images
const rank1Data = {
    template: 'rank1',
    rank: 1,
    artist: 'Tena Khimphun',
    title: 'Tena - 72 ម៉ោង Feat Narik',
    heatPoint: '202',
    growth: '0.7429',
    views: '333.1K',
    engagement: '0.057',
    change: '+1'
};
const multiData = [
    // Ranks 2-4
    [
        { rank: 2, artist: 'Tep Piseth', title: 'TEP PISETH - លក្ខិណា' },
        { rank: 3, artist: 'Norith - នរិទ្ធ', title: 'NORITH - DECADE OF LOVE FT. VANNDA' },
        { rank: 4, artist: 'McSey', title: 'McSey - ១នាទី [ One Minute ]' }
    ],
    // Ranks 5-7
    [
        { rank: 5, artist: 'VANNDA', title: 'VANNDA - NEON LIGHT' },
        { rank: 6, artist: 'អុីវ៉ា (Eva)', title: 'ស្រុកស្រែចាំបង - អុីវ៉ា' },
        { rank: 7, artist: 'Tep Piseth', title: 'Tep Piseth - ស្រីង៉ា [ TAPE #2 ]' }
    ],
    // Ranks 8-10
    [
        { rank: 8, artist: 'Tep Piseth', title: 'Tep Piseth - WMW [ TAPE #1 ]' },
        { rank: 9, artist: 'DIA', title: 'DIA x @GMENGZ - NO VITAMIN' },
        { rank: 10, artist: 'KlapYaHandZ', title: '2MDIE - SNEHA ft. TEY (DJ Chee remix)' }
    ]
];

async function generateImageUrl(data) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
        if (key === 'items') {
            params.append(key, JSON.stringify(value));
        } else {
            params.append(key, value);
        }
    }
    return `${OG_API_URL}?${params.toString()}`;
}

async function uploadPhoto(url) {
    console.log(`Generating image from: ${url}`);
    const ogResponse = await fetch(url);
    if (!ogResponse.ok) throw new Error(`Failed to fetch image: ${ogResponse.statusText}`);
    const imageBuffer = await ogResponse.buffer();

    const formData = new FormData();
    formData.append('source', imageBuffer, { filename: 'ranking.png', contentType: 'image/png' });
    formData.append('published', 'false'); // Do not publish immediately
    formData.append('access_token', FB_ACCESS_TOKEN);

    const fbResponse = await fetch(`https://graph.facebook.com/${PAGE_ID}/photos`, {
        method: 'POST',
        body: formData
    });

    const result = await fbResponse.json();
    if (!fbResponse.ok) throw new Error(`FB Upload Error: ${JSON.stringify(result)}`);
    return result.id;
}

async function postAllRanks() {
    console.log('--- Facebook Multi-Photo Post Script ---');
    if (!FB_ACCESS_TOKEN) {
        console.error('Error: FB_ACCESS_TOKEN is not defined');
        process.exit(1);
    }

    try {
        const photoIds = [];

        // 1. Generate URLs
        const urls = [
            await generateImageUrl(rank1Data),
            ...await Promise.all(multiData.map(items => generateImageUrl({ template: 'multi', items })))
        ];

        // 2. Upload photos
        console.log('Uploading 4 photos to Facebook...');
        for (const url of urls) {
            const id = await uploadPhoto(url);
            console.log(`Uploaded Photo ID: ${id}`);
            photoIds.push(id);
        }

        // 3. Create Feed Post
        console.log('Creating multi-photo post...');
        const dateStr = '2026.02.18';
        const message = `HEAT – Cambodia Daily Ranking
${dateStr}

#1 ${rank1Data.artist} – ${rank1Data.title}
${rank1Data.heatPoint} HEAT POINT (${rank1Data.change})

Top 20 in Top comment.`;

        const feedFormData = new URLSearchParams();
        feedFormData.append('message', message);
        feedFormData.append('access_token', FB_ACCESS_TOKEN);
        photoIds.forEach((id, index) => {
            feedFormData.append(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
        });

        const feedResponse = await fetch(`https://graph.facebook.com/${PAGE_ID}/feed`, {
            method: 'POST',
            body: feedFormData
        });

        const feedResult = await feedResponse.json();
        if (feedResponse.ok) {
            console.log('✅ Successfully posted multi-photo post to Facebook!');
            const postID = feedResult.id;
            console.log('Post ID:', postID);
            console.log('Post URL:', `https://www.facebook.com/${postID}`);

            // 4. Create Top Comment
            console.log('Adding top comment...');
            const commentMessage = `Full Top 20:
https://daily-rank-kh.vercel.app
Updated daily.`;

            const commentFormData = new URLSearchParams();
            commentFormData.append('message', commentMessage);
            commentFormData.append('access_token', FB_ACCESS_TOKEN);

            const commentResponse = await fetch(`https://graph.facebook.com/${postID}/comments`, {
                method: 'POST',
                body: commentFormData
            });

            const commentResult = await commentResponse.json();
            if (commentResponse.ok) {
                console.log('✅ Successfully added top comment!');
            } else {
                console.error('❌ Failed to add top comment:');
                console.error(JSON.stringify(commentResult, null, 2));
            }
        } else {
            console.error('❌ Failed to create feed post:');
            console.error(JSON.stringify(feedResult, null, 2));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

postAllRanks();
