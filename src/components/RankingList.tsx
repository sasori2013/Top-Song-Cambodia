'use client';

import React from 'react';
import { RankingItem, RankingStats } from '@/lib/types';
import { RankingCard } from './RankingCard';
import { HeatIndexMetrics } from './HeatIndexMetrics';

interface RankingListProps {
    items: RankingItem[];
    stats?: RankingStats;
}

export const RankingList: React.FC<RankingListProps> = ({ items, stats }) => {
    return (
        <section className="container mx-auto max-w-6xl px-4 md:px-6 py-20 border-t border-white/5">
            <div className="flex flex-col items-center mb-16 md:mb-24">
                <HeatIndexMetrics growth={stats?.heatGrowth} trend={stats?.heatTrend} />
                <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] text-white uppercase pl-[0.8em]">
                    Daily Heat Ranking
                </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-12 gap-y-12 md:gap-y-20">
                {[...items].sort((a, b) => a.rank - b.rank).map((item, index) => (
                    <RankingCard key={item.videoId || `rank-${item.rank}-${index}`} item={item} index={item.rank} />
                ))}
            </div>

        </section>
    );
};
