import { RankingResponse } from './types';

// TODO: Replace with your actual GAS Web App URL
const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || '';

export async function getRankingData(): Promise<RankingResponse> {
    const mock = getMockData();

    // If no API URL is provided, return mock data for development
    if (!GAS_API_URL) {
        return mock;
    }

    try {
        const res = await fetch(GAS_API_URL, {
            cache: 'no-store',
        });

        if (!res.ok) {
            throw new Error('Failed to fetch ranking data');
        }

        const data = await res.json();

        // Basic validation to ensure data matches our expectations
        if (!data || !Array.isArray(data.ranking)) {
            console.error('Invalid API response structure:', data);
            return mock;
        }

        return data as RankingResponse;
    } catch (error) {
        console.error('API Fetch Error:', error);
        return mock; // Fallback to mock data on error
    }
}

function getMockData(): RankingResponse {
    const mockRanking = [
        {
            rank: 1,
            artist: "VannDa",
            title: "NEON LIGHT (OFFICIAL VIDEO)",
            views: 1330000,
            growth: 12.5,
            heatScore: 98.4,
            engagement: 4.2,
            dailyViews: 45000,
            note: "Trending in Cambodia",
            facebook: "https://www.facebook.com/vanndaofficialpage",
            videoId: "uv4JKlL1o84",
            thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg",
            url: "https://www.youtube.com/watch?v=uv4JKlL1o84",
            history: [1100000, 1150000, 1180000, 1220000, 1250000, 1300000, 1330000]
        },
        {
            rank: 2,
            artist: "Tena",
            title: "Song Title 2",
            views: 950000,
            growth: 8.2,
            heatScore: 82.1,
            engagement: 3.8,
            dailyViews: 12000,
            note: "Stable performer",
            facebook: "https://www.facebook.com/tenakhimphun",
            videoId: "S01NnQoE-m0",
            thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg",
            url: "https://www.youtube.com/watch?v=S01NnQoE-m0",
            history: [900000, 910000, 915000, 920000, 930000, 940000, 950000]
        },
        { rank: 3, artist: "G-Devith", title: "DIT-WAY", views: 880000, growth: 15.2, heatScore: 78.5, engagement: 5.1, dailyViews: 32000, note: "", facebook: "", videoId: "M_8_Y6D-T5g", thumbnail: "https://img.youtube.com/vi/M_8_Y6D-T5g/maxresdefault.jpg", url: "#", history: [700000, 750000, 800000, 820000, 840000, 860000, 880000] },
        { rank: 4, artist: "Kmeng Khmer", title: "My Way", views: 720000, growth: 5.4, heatScore: 65.2, engagement: 2.9, dailyViews: 8500, note: "", facebook: "", videoId: "P_z_z2Y3X0k", thumbnail: "https://img.youtube.com/vi/P_z_z2Y3X0k/maxresdefault.jpg", url: "#", history: [680000, 690000, 700000, 705000, 710000, 715000, 720000] },
        { rank: 5, artist: "Preap Sovath", title: "Legendary Hit", views: 54000000, growth: 1.2, heatScore: 92.0, engagement: 1.5, dailyViews: 5000, note: "", facebook: "", videoId: "_x_x_x_5", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [53900000, 53920000, 53940000, 53960000, 53980000, 53990000, 54000000] },
        { rank: 6, artist: "Suly Pheng", title: "Missing You", views: 420000, growth: 11.0, heatScore: 54.3, engagement: 6.2, dailyViews: 15000, note: "", facebook: "", videoId: "_x_x_x_6", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [350000, 370000, 385000, 395000, 405000, 415000, 420000] },
        { rank: 7, artist: "YCN Tomie", title: "Flow", views: 310000, growth: 22.5, heatScore: 68.7, engagement: 4.8, dailyViews: 20000, note: "", facebook: "", videoId: "_x_x_x_7", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [220000, 240000, 260000, 275000, 290000, 305000, 310000] },
        { rank: 8, artist: "Chhay Virakyuth", title: "Slow Soul", views: 650000, growth: 3.1, heatScore: 45.9, engagement: 1.2, dailyViews: 4000, note: "", facebook: "", videoId: "_x_x_x_8", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [640000, 642000, 644000, 646000, 648000, 649000, 650000] },
        { rank: 9, artist: "SmallWorld SmallBand", title: "Unity", views: 280000, growth: 7.8, heatScore: 42.1, engagement: 3.5, dailyViews: 6500, note: "", facebook: "", videoId: "_x_x_x_9", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [250000, 260000, 265000, 270000, 275000, 278000, 280000] },
        { rank: 10, artist: "Manith", title: "Voice", views: 195000, growth: 4.2, heatScore: 35.4, engagement: 2.1, dailyViews: 3500, note: "", facebook: "", videoId: "_x_x_x_10", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [180000, 185000, 188000, 190000, 192000, 194000, 195000] },
        { rank: 11, artist: "Laura Mam", title: "Dance", views: 410000, growth: 6.5, heatScore: 48.2, engagement: 3.0, dailyViews: 7200, note: "", facebook: "", videoId: "_x_x_x_11", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [380000, 385000, 390000, 395000, 400000, 405000, 410000] }
    ];

    return {
        updatedAt: new Date().toISOString(),
        ranking: mockRanking
    };
}
