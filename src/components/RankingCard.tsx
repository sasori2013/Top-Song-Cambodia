'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { RankingItem } from '@/lib/types';
import { FluctuatingText } from './FluctuatingText';
import { TrendChart } from './TrendChart';
import { HeatScore } from './HeatScore';
import { DottedImage } from './DottedImage';

interface RankingCardProps {
    item: RankingItem;
    index: number;
}

export const RankingCard: React.FC<RankingCardProps> = ({ item, index }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "100px" }}
            transition={{ duration: 1.2 }}
            className="group flex flex-col items-center text-center w-full"
        >
            <div className="mb-2 text-[8px] md:text-[10px] font-bold tracking-[0.3em] text-white/30 group-hover:text-white/60 transition-colors uppercase">
                DAILY RANK {index < 10 ? `0${index}` : index}
            </div>

            <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link block w-full mb-4"
            >
                <div className="relative aspect-video w-full overflow-hidden border border-white/5 bg-black transition-transform duration-500 group-hover:scale-105">
                    <DottedImage src={item.thumbnail} />
                    <div className="absolute inset-0 bg-black/40 transition-opacity group-hover:opacity-0" />
                </div>
            </a>

            <div className="flex flex-col items-center w-full gap-1">
                <h3 className="text-xs md:text-sm lg:text-base font-black text-white group-hover:text-cyan-400 transition-colors line-clamp-1 px-1 tracking-tight">
                    {item.artist}
                </h3>
                <p className="text-[10px] md:text-xs text-white/50 line-clamp-1 px-2 mb-3">
                    {item.title}
                </p>

                <HeatScore
                    rank={undefined}
                    score={item.heatScore}
                    size="sm"
                    color="#ffffff"
                    className="mb-4 opacity-70 group-hover:opacity-100 transition-opacity scale-90 md:scale-100"
                />

                <div className="flex flex-col items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity w-full">
                    <div className="scale-75 md:scale-100 origin-center h-6 md:h-auto overflow-visible">
                        <TrendChart data={item.history} width={100} height={24} color="#ffffff" />
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
