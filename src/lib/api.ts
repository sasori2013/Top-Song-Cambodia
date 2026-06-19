import { unstable_cache } from 'next/cache';
import { RankingResponse } from './types';

// Prioritize environment variable, fallback to current active deployment
export const GAS_API_URL = process.env.NEXT_PUBLIC_GAS_API_URL || 'https://script.google.com/macros/s/AKfycbwcCVTf4NPMO2NHdqeQ5OolplixthM4vUwYeyCKJaA1vpp48dG9NBwGG0wI781bfrxBkg/exec';

export const getCachedBQData = unstable_cache(
    async () => {
        const { getRankingDataFromBQ } = await import('./bigquery');
        const data = await getRankingDataFromBQ();
        // Throw on null so unstable_cache does not store the failure result
        if (!data) throw new Error('BQ returned null');
        return data;
    },
    ['bq-ranking-data'],
    { revalidate: 86400, tags: ['bq-ranking'] } // 24h fallback; invalidated on-demand by pipeline
);

export async function getRankingData(): Promise<RankingResponse> {
    const mock = getMockData();

    // 1. If on Server, try BigQuery directly (cached)
    if (typeof window === 'undefined') {
        try {
            const bqData = await getCachedBQData();
            if (bqData) {
                console.log('Fetched ranking from BigQuery (cached)');
                return bqData;
            }
        } catch (e) {
            console.error('Server-side BQ fetch failed, falling back:', e);
        }
    }

    // 2. If on Client or BQ failed, try our new internal API or GAS
    const API_URL = typeof window !== 'undefined' ? '/api/ranking' : GAS_API_URL;

    if (!API_URL) {
        console.warn('API_URL is empty');
        return mock;
    }

    try {
        console.log('Fetching from:', API_URL);
        const res = await fetch(API_URL, {
            next: { revalidate: 1800 },
            method: 'GET',
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch: ${res.status}`);
        }

        const data = await res.json();
        
        if (!data || !Array.isArray(data.ranking)) {
            console.error('Invalid API response structure');
            return mock;
        }

        // Map thumbnails if needed (BQ API already does this, but for GAS fallback)
        const mapRanking = (list: any[]) => (list || []).map(item => ({
            ...item,
            thumbnail: item.thumbnail || (item.videoId ? `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg` : '')
        }));

        return {
            ...data,
            ranking: mapRanking(data.ranking),
            rankingLong: mapRanking(data?.rankingLong || [])
        } as RankingResponse;
    } catch (error) {
        console.error('API Fetch Error:', error);
        return mock;
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
            history: [1100000, 1150000, 1180000, 1220000, 1250000, 1300000, 1330000],
            publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
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
            history: [900000, 910000, 915000, 920000, 930000, 940000, 950000],
            publishedAt: "2024-01-01T00:00:00Z"
        },
        { rank: 3, artist: "G-Devith", title: "DIT-WAY", views: 880000, growth: 15.2, heatScore: 78.5, engagement: 5.1, dailyViews: 32000, note: "", facebook: "", videoId: "M_8_Y6D-T5g", thumbnail: "https://img.youtube.com/vi/M_8_Y6D-T5g/maxresdefault.jpg", url: "#", history: [700000, 750000, 800000, 820000, 840000, 860000, 880000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 4, artist: "Kmeng Khmer", title: "My Way", views: 720000, growth: 5.4, heatScore: 65.2, engagement: 2.9, dailyViews: 8500, note: "", facebook: "", videoId: "P_z_z2Y3X0k", thumbnail: "https://img.youtube.com/vi/P_z_z2Y3X0k/maxresdefault.jpg", url: "#", history: [680000, 690000, 700000, 705000, 710000, 715000, 720000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 5, artist: "Preap Sovath", title: "Legendary Hit", views: 54000000, growth: 1.2, heatScore: 92.0, engagement: 1.5, dailyViews: 5000, note: "", facebook: "", videoId: "_x_x_x_5", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [53900000, 53920000, 53940000, 53960000, 53980000, 53990000, 54000000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 6, artist: "Suly Pheng", title: "Missing You", views: 420000, growth: 11.0, heatScore: 54.3, engagement: 6.2, dailyViews: 15000, note: "", facebook: "", videoId: "_x_x_x_6", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [350000, 370000, 385000, 395000, 405000, 415000, 420000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 7, artist: "YCN Tomie", title: "Flow", views: 310000, growth: 22.5, heatScore: 68.7, engagement: 4.8, dailyViews: 20000, note: "", facebook: "", videoId: "_x_x_x_7", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [220000, 240000, 260000, 275000, 290000, 305000, 310000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 8, artist: "Chhay Virakyuth", title: "Slow Soul", views: 650000, growth: 3.1, heatScore: 45.9, engagement: 1.2, dailyViews: 4000, note: "", facebook: "", videoId: "_x_x_x_8", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [640000, 642000, 644000, 646000, 648000, 649000, 650000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 9, artist: "SmallWorld SmallBand", title: "Unity", views: 280000, growth: 7.8, heatScore: 42.1, engagement: 3.5, dailyViews: 6500, note: "", facebook: "", videoId: "_x_x_x_9", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [250000, 260000, 265000, 270000, 275000, 278000, 280000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 10, artist: "Manith", title: "Voice", views: 195000, growth: 4.2, heatScore: 35.4, engagement: 2.1, dailyViews: 3500, note: "", facebook: "", videoId: "_x_x_x_10", thumbnail: "https://img.youtube.com/vi/S01NnQoE-m0/maxresdefault.jpg", url: "#", history: [180000, 185000, 188000, 190000, 192000, 194000, 195000], publishedAt: "2024-01-01T00:00:00Z" },
        { rank: 11, artist: "Laura Mam", title: "Dance", views: 410000, growth: 6.5, heatScore: 48.2, engagement: 3.0, dailyViews: 7200, note: "", facebook: "", videoId: "_x_x_x_11", thumbnail: "https://img.youtube.com/vi/uv4JKlL1o84/maxresdefault.jpg", url: "#", history: [380000, 385000, 390000, 395000, 400000, 405000, 410000], publishedAt: "2024-01-01T00:00:00Z" }
    ];

    return {
        updatedAt: new Date().toISOString(),
        stats: {
            totalArtists: 98,
            totalProductions: 10,
            totalSongs: 233,
            heatGrowth: 12.5,
            heatTrend: [12000, 15000, 14000, 18000, 22000, 21000, 25000, 24000, 28000, 27000, 31000, 30000, 35000, 34000],
            weeklyGenreViews: [
                { genre: 'Hip-hop & Rap',     views: 3678633 },
                { genre: 'Pop',               views: 2398188 },
                { genre: 'Ballad',            views: 1777956 },
                { genre: 'Traditional Khmer', views: 1307822 },
                { genre: 'Dance & EDM',       views:  390083 },
                { genre: 'R&B & Soul',        views:   93843 },
            ],
            dailyTraffic: [
                { date: '06-04', value: 1955126 },
                { date: '06-05', value: 1791558 },
                { date: '06-06', value: 1729742 },
                { date: '06-07', value: 2081255 },
                { date: '06-08', value: 1958503 },
                { date: '06-09', value: 1698752 },
                { date: '06-10', value: 1879981 },
                { date: '06-11', value: 1486687 },
                { date: '06-12', value: 1397583 },
                { date: '06-13', value: 1369971 },
                { date: '06-14', value: 1594556 },
                { date: '06-15', value: 1773961 },
                { date: '06-16', value: 1275538 },
                { date: '06-17', value: 1452029 }
            ],
            dailyActions: {
                views: 1600000, likes: 9500, comments: 158,
                prev: { views: 1420000, likes: 8800, comments: 141 },
                sentiment: { positive: 76, neutral: 17, negative: 7, songs: 227 },
                genreViews: [
                    { genre: 'Hip-hop & Rap',     views: 484036 },
                    { genre: 'Pop',               views: 324710 },
                    { genre: 'Ballad',            views: 240837 },
                    { genre: 'Traditional Khmer', views: 178532 },
                    { genre: 'Dance & EDM',       views:  56665 },
                    { genre: 'R&B & Soul',        views:   3728 },
                ],
                topSongs: [
                    { title: 'មេតំបន់/MAY DOMBON', artist: 'Tep Piseth',  genre: 'Hip-hop & Rap',     views: 154693, likes: 908 },
                    { title: 'Way You Are',        artist: 'Jady',         genre: 'Pop',               views: 133571, likes: 576 },
                    { title: 'TRAPPIN',            artist: '4LEN',         genre: 'Hip-hop & Rap',     views: 101865, likes: 815 },
                    { title: 'SORA',               artist: 'YUUHAI',       genre: 'Hip-hop & Rap',     views:  79443, likes: 208 },
                    { title: 'ស្ទាវកង់ស្ព័រ',        artist: 'VAN CHESDA',  genre: 'Traditional Khmer', views:  57553, likes: 209 },
                ],
            }
        },
        ranking: mockRanking,
        genreTrend: {
            months: ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'],
            series: [
                { genre: 'Pop',             values: [8, 10, 9, 12, 11, 14, 10, 9,  13, 18, 16, 20] },
                { genre: 'Hip-hop & Rap',   values: [14, 16, 18, 15, 17, 13, 16, 19, 14, 12, 15, 14] },
                { genre: 'R&B & Soul',      values: [5,  4,  6,  5,  4,  6,  5,  7,  6,  5,  6,  7] },
                { genre: 'Ballad',          values: [6,  7,  5,  8,  9,  10, 8,  6,  7,  6,  5,  6] },
                { genre: 'Traditional Khmer', values:[2,  2,  3,  2,  2,  4,  2,  2,  3, 10, 8,  3] },
                { genre: 'Dance & EDM',     values: [3,  4,  3,  4,  3,  4,  3,  4,  4,  4,  5,  4] },
                { genre: 'Rock',            values: [2,  2,  2,  3,  2,  2,  3,  2,  2,  2,  2,  3] },
            ],
        },
        genreTrendViews: {
            months: ['2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'],
            series: [
                { genre: 'Pop',             values: [120000, 150000, 130000, 180000, 160000, 200000, 140000, 120000, 190000, 260000, 220000, 300000] },
                { genre: 'Hip-hop & Rap',   values: [210000, 240000, 270000, 220000, 250000, 190000, 230000, 280000, 200000, 170000, 210000, 200000] },
                { genre: 'R&B & Soul',      values: [60000,  50000,  80000,  70000,  55000,  90000,  65000,  90000,  80000,  70000,  80000,  90000] },
                { genre: 'Ballad',          values: [80000,  95000,  70000, 110000, 130000, 150000, 110000,  80000,  95000,  85000,  70000,  85000] },
                { genre: 'Traditional Khmer', values:[25000,  28000,  40000,  30000,  28000,  55000,  28000,  28000,  45000, 450000, 120000,  40000] },
                { genre: 'Dance & EDM',     values: [40000,  55000,  40000,  55000,  40000,  55000,  40000,  55000,  55000,  55000,  70000,  55000] },
                { genre: 'Rock',            values: [20000,  20000,  20000,  30000,  20000,  20000,  30000,  20000,  20000,  20000,  20000,  30000] },
            ],
        },
        releaseActivity: {
            weekly: [
                { label: '3W AGO', count: 8,  isCurrent: false },
                { label: '2W AGO', count: 11, isCurrent: false },
                { label: 'LAST WK', count: 9, isCurrent: false },
                { label: 'THIS WK', count: 14, isCurrent: true },
            ],
            monthly: [
                { label: 'JUL', count: 22, isCurrent: false },
                { label: 'AUG', count: 18, isCurrent: false },
                { label: 'SEP', count: 25, isCurrent: false },
                { label: 'OCT', count: 31, isCurrent: false },
                { label: 'NOV', count: 28, isCurrent: false },
                { label: 'DEC', count: 19, isCurrent: false },
                { label: 'JAN', count: 24, isCurrent: false },
                { label: 'FEB', count: 33, isCurrent: false },
                { label: 'MAR', count: 29, isCurrent: false },
                { label: 'APR', count: 27, isCurrent: false },
                { label: 'MAY', count: 35, isCurrent: false },
                { label: 'JUN', count: 41, isCurrent: true },
            ],
        },
    };
}
