'use client';

import React from 'react';
import { RankingItem, RankingStats } from '@/lib/types';
import { RankingCard } from './RankingCard';
import { HeatIndexMetrics } from './HeatIndexMetrics';

interface RankingListProps {
    items: RankingItem[];
    stats?: RankingStats;
    hideMetrics?: boolean;
    showList?: boolean;
    children?: React.ReactNode;
}

export const RankingList: React.FC<RankingListProps> = ({ 
    items, 
    stats, 
    hideMetrics, 
    showList = true,
    children
}) => {
    return (
        <section className="container mx-auto max-w-6xl px-4 md:px-6 py-20 border-t border-white/5">
            <div className="flex flex-col items-center mb-16 md:mb-24">
                {!hideMetrics && <HeatIndexMetrics growth={stats?.heatGrowth} trend={stats?.heatTrend} />}
                
                {children}

                {showList && (
                    <>
                        <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] text-white uppercase pl-[0.8em] mt-16">
                            {hideMetrics ? 'AI Search Results' : 'Daily Heat Ranking'}
                        </h2>
                        {!hideMetrics && (
                            <p className="mt-4 text-[8px] md:text-[9px] font-medium tracking-[0.2em] text-white/30 uppercase">
                                Songs within 2 months of release are eligible / リリース後2ヶ月以内の楽曲が対象
                            </p>
                        )}
                    </>
                )}
            </div>

            {showList && (
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-12 gap-y-12 md:gap-y-20">
                    {[...items].sort((a, b) => a.rank - b.rank).map((item, index) => (
                        <RankingCard key={item.videoId || `rank-${item.rank}-${index}`} item={item} index={item.rank} />
                    ))}
                </div>
            )}

        </section>
    );
};
