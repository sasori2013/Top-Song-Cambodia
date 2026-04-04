'use client';

import React, { useState } from 'react';
import { RankingList } from './RankingList';
import { AISearchBar } from './AISearchBar';
import { RankingItem, RankingStats } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

interface MainRankingViewProps {
    initialItems: RankingItem[];
    stats?: RankingStats;
}

export const MainRankingView: React.FC<MainRankingViewProps> = ({ initialItems, stats }) => {
    const [displayItems, setDisplayItems] = useState<RankingItem[]>(initialItems);
    const [isSearching, setIsSearching] = useState(false);
    const [isResultsMode, setIsResultsMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (results: any[], searching: boolean) => {
        setIsSearching(searching);
        if (!searching) {
            setDisplayItems(results);
            setIsResultsMode(true);
        }
    };

    const handleClear = () => {
        setDisplayItems(initialItems);
        setIsResultsMode(false);
        setIsSearching(false);
    };

    return (
        <div className="relative">
            {/* Search Bar Section */}
            <div className="pt-10 pb-4">
                <AISearchBar onSearch={handleSearch} onClear={handleClear} />
            </div>

            <AnimatePresence mode="wait">
                {isSearching ? (
                    <motion.div
                        key="searching"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-40"
                    >
                        <div className="relative w-20 h-20">
                            <div className="absolute inset-0 border-t-2 border-r-2 border-[#D1FF00] rounded-full animate-spin" />
                            <div className="absolute inset-2 border-b-2 border-l-2 border-white/20 rounded-full animate-reverse-spin" />
                        </div>
                        <div className="mt-8 text-[10px] font-black tracking-[1em] text-white/40 uppercase">
                            Analyzing Sound Waves...
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key={isResultsMode ? 'results' : 'ranking'}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5 }}
                    >
                        {isResultsMode && (
                            <div className="container mx-auto max-w-6xl px-6 mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
                                    <h3 className="text-[10px] font-black tracking-[0.5em] text-[#D1FF00] uppercase">
                                        AI Results Found: {displayItems.length}
                                    </h3>
                                    <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
                                </div>
                            </div>
                        )}
                        
                        {displayItems.length > 0 ? (
                            <RankingList items={displayItems} stats={isResultsMode ? undefined : stats} hideMetrics={isResultsMode} />
                        ) : isResultsMode && (
                            <div className="flex flex-col items-center justify-center py-40">
                                <div className="text-white/20 text-sm font-medium tracking-widest uppercase">
                                    No direct matches found. Try different vibes.
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx global>{`
                @keyframes reverse-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(-360deg); }
                }
                .animate-reverse-spin {
                    animation: reverse-spin 1.5s linear infinite;
                }
            `}</style>
        </div>
    );
};
