'use client';

import React from 'react';
import { RankingItem } from '@/lib/types';
import { RankingCard } from './RankingCard';

interface RankingListProps {
    items: RankingItem[];
}

export const RankingList: React.FC<RankingListProps> = ({ items }) => {
    return (
        <section className="container mx-auto max-w-6xl px-4 md:px-6 py-20">
            <div className="flex flex-col items-center mb-16 md:mb-24">
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent mb-8" />
                <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] text-white/40 uppercase pl-[0.8em]">
                    Daily Heat Ranking
                </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-12 gap-y-12 md:gap-y-20">
                {items.map((item, index) => (
                    <RankingCard key={item.videoId} item={item} index={index + 1} />
                ))}
            </div>

            <div className="mt-40 max-w-4xl mx-auto text-center border-t border-white/5 pt-12">
                <p className="text-[11px] md:text-[13px] text-white/50 leading-relaxed font-normal tracking-wide px-6">
                    Disclaimer: HEAT Point, VEL, and RCT are proprietary metrics independently calculated by HEAT using an AI-driven intelligence layer. These indices integrate public data from YouTube, Facebook, and TikTok to provide a comprehensive analysis of the Cambodian music market. These metrics are independent of, and do not replace, the official analytics provided by YouTube or any other platform.
                </p>
            </div>
        </section>
    );
};
