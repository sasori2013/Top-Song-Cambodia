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
    rankChange?: number | 'NEW';
    genre?: string;
    visualConcept?: string;
}

export interface RankingStats {
    totalArtists: number;
    totalProductions: number;
    totalSongs: number;
    heatGrowth?: number;
    heatTrend?: number[];
    weeklyGenreViews?: { genre: string; views: number }[];
    dailyActions?: {
        views: number; likes: number; comments: number;
        prev?: { views: number; likes: number; comments: number };
        genreViews?: { genre: string; views: number }[];
        topSongs?: { title: string; artist: string; genre?: string; views: number; likes: number }[];
        sentiment?: { positive: number; neutral: number; negative: number; songs: number };
    };
}

export interface ReleasePeriod {
    label: string;
    count: number;
    isCurrent: boolean;
}

export interface GenreTrendData {
    months: string[];
    series: { genre: string; values: number[] }[];
}

export interface ReleaseActivity {
    weekly: ReleasePeriod[];
    monthly: ReleasePeriod[];
}

export interface RankingResponse {
    updatedAt: string;
    stats?: RankingStats;
    ranking: RankingItem[];
    regionalData?: { id: string; value: number }[];
    releaseActivity?: ReleaseActivity;
    genreTrend?: GenreTrendData;
    genreTrendViews?: GenreTrendData;
}
