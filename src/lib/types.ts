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
}

export interface RankingResponse {
    updatedAt: string;
    ranking: RankingItem[];
}
