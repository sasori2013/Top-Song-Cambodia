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
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-12 gap-y-12 md:gap-y-20">
                {items.map((item, index) => (
                    <RankingCard key={item.videoId} item={item} index={index + 1} />
                ))}
            </div>
        </section>
    );
};
