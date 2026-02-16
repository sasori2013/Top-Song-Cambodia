export interface RankingItem {
    rank: number;
    artist: string;
    title: string;
    views: number;
    growth: number;
    heatScore: number;
    engagement: number;
    dailyViews: number;
    note: string;
    facebook: string;
    videoId: string;
    thumbnail: string;
    url: string;
    history: number[];
    publishedAt?: string;
    aiScore?: number;
    aiInsight?: string;
}

export interface RankingStats {
    totalArtists: number;
    totalProductions: number;
    totalSongs: number;
}

export interface RankingResponse {
    updatedAt: string;
    stats?: RankingStats;
    ranking: RankingItem[];
}
