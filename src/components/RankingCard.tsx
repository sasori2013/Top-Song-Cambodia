'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { RankingItem } from '@/lib/types';
import { FluctuatingText } from './FluctuatingText';
import { TrendChart } from './TrendChart';
import { HeatScore } from './HeatScore';
import { cleanSongTitle } from '@/lib/utils';

interface RankingCardProps {
    item: RankingItem;
    index: number;
}

export const RankingCard: React.FC<RankingCardProps> = ({ item, index }) => {
    const cleanedTitle = cleanSongTitle(item.title);
    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "100px" }}
            transition={{ duration: 1.2 }}
            className="group flex flex-col items-center text-center w-full"
        >
            <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link block w-full mb-4"
            >
                <div className="relative aspect-video w-full overflow-hidden border border-white/5 bg-black">
                    {/* Simple Rank Number Overlay */}
                    <div className="absolute top-2 left-3 z-30 flex items-baseline gap-1 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        <span className="font-bold text-3xl md:text-4xl text-white/70 italic pr-1">
                            {index}
                        </span>
                    </div>

                    <div className="relative h-full w-full">
                        <motion.img
                            src={item.thumbnail}
                            className="h-full w-full object-cover mixture-blend-lighten"
                            alt={cleanedTitle}
                            animate={{
                                opacity: [0.6, 0.85, 0.6],
                                filter: [
                                    "brightness(0.9) contrast(1.4)",
                                    "brightness(1.2) contrast(1.4)",
                                    "brightness(0.9) contrast(1.4)"
                                ]
                            }}
                            transition={{
                                duration: 5,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: Math.random() * 2 // 個別にタイミングをずらして自然に
                            }}
                        />
                        {/* デジタル・メッシュ・オーバーレイ */}
                        <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{
                            backgroundImage: `
                                radial-gradient(circle, #fff 0.5px, transparent 0.5px),
                                linear-gradient(to bottom, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px, transparent 2px)
                            `,
                            backgroundSize: '3px 3px, 100% 3px'
                        }} />
                    </div>

                    <div className="absolute inset-0 bg-black/30 pointer-events-none" />

                    {/* NEW Badge */}
                    {(() => {
                        if (!item.publishedAt) return null;
                        const pubDate = new Date(item.publishedAt);
                        const diffTime = Math.abs(new Date().getTime() - pubDate.getTime());
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays <= 7) {
                            return (
                                <div className="absolute top-2 right-2 z-30 overflow-hidden">
                                    <div className="bg-white text-[8px] md:text-[10px] font-black text-black px-2 py-0.5 tracking-tighter shadow-lg transform skew-x-[-12deg] border border-black/10">
                                        NEW
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            </a>

            <div className="flex flex-col items-center w-full gap-1">
                <h3 className="text-xs md:text-sm lg:text-base font-black text-white line-clamp-1 px-1 tracking-tight">
                    {item.artist}
                </h3>
                <p className="text-[10px] md:text-xs text-white/50 line-clamp-1 px-2 mb-1">
                    {cleanedTitle}
                </p>
                {/* Rank Change Status - Smart Integrated Design */}
                <div className="mb-3 h-6 flex items-center justify-center">
                    {item.rankChange !== undefined ? (
                        <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black tracking-[0.2em] uppercase transition-all duration-300">
                            {item.rankChange > 0 ? (
                                <span className="flex items-center gap-1.5 text-[#00ccff] animate-pulse-slow">
                                    <span className="text-[12px]">▲</span>
                                    <span>RANK UP</span>
                                    <span className="font-mono text-[11px] ml-1">+{item.rankChange}</span>
                                </span>
                            ) : item.rankChange < 0 ? (
                                <span className="flex items-center gap-1.5 text-white/30">
                                    <span className="text-[12px]">▼</span>
                                    <span>RANK DOWN</span>
                                    <span className="font-mono text-[11px] ml-1">{item.rankChange}</span>
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-white/30">
                                    <span className="text-[10px]">▶</span>
                                    <span className="tracking-[0.4em]">STAY</span>
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="h-6" />
                    )}
                </div>


                <HeatScore
                    rank={undefined}
                    score={item.heatScore}
                    size="sm"
                    color="#ffffff"
                    disableAnimation={true}
                    className="mb-4 opacity-80 scale-90 md:scale-100"
                />

                <div className="flex flex-col items-center gap-2 opacity-80 w-full px-4">
                    <div className="md:scale-100 origin-center h-12 md:h-auto overflow-visible w-full max-w-[200px]">
                        <TrendChart data={item.history} width={200} height={48} color="#ffffff" heatScore={item.heatScore} />
                    </div>
                    <div className="flex items-center gap-2 md:gap-4 border-t border-white/5 pt-2 w-full justify-center max-w-[200px]">
                        <div className="flex flex-col items-center">
                            <span className="text-[5px] md:text-[6px] text-white/20 font-bold uppercase tracking-widest">VEL</span>
                            <span className="text-[9px] md:text-[11px] text-white/60 font-mono">+{item.growth}%</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[5px] md:text-[6px] text-white/20 font-bold uppercase tracking-widest">RCT</span>
                            <span className="text-[9px] md:text-[11px] text-white/60 font-mono">{item.engagement}%</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[5px] md:text-[6px] text-white/20 font-bold uppercase tracking-widest">DAY</span>
                            <span className="text-[9px] md:text-[11px] text-white/60 font-mono">{item.dailyViews > 1000 ? (item.dailyViews / 1000).toFixed(1) + 'K' : item.dailyViews}</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
