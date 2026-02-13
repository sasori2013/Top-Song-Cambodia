'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Youtube, Facebook } from 'lucide-react';
import { RankingItem } from '@/lib/types';
import { FluctuatingText } from './FluctuatingText';
import { AuraR3F } from './AuraR3F';
import { IntelligenceText } from './IntelligenceText';
import { Canvas } from '@react-three/fiber';
import { DottedImage } from './DottedImage';
import { TrendChart } from './TrendChart';
import { MetricsBoard } from './MetricsBoard';
import { HeatScore } from './HeatScore';

interface HeroProps {
    topItem: RankingItem | undefined;
}

export const Hero: React.FC<HeroProps> = ({ topItem }) => {
    if (!topItem) return <div className="h-48" />;

    return (
        <section className="flex min-h-[80vh] flex-col items-center justify-center pt-32 pb-20 text-center">
            <div className="container mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1.5 }}
                    className="flex flex-col items-center"
                >
                    {/* Heat Score Branding & Rank */}
                    <HeatScore rank={1} score={topItem.heatScore} className="mb-0" />

                    <AuraR3F color="rgba(255, 255, 255, 0.2)" fullscreen />

                    {/* Artist Name with AI Discovery Effect */}
                    <motion.div
                        className="relative z-10 -mt-4 mb-0 h-40 w-full max-w-4xl"
                    >
                        <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
                            <IntelligenceText text={topItem.artist} />
                        </Canvas>
                    </motion.div>
                    <p className="relative z-20 -mt-12 mb-6 text-xs font-medium tracking-[0.2em] text-white/30 uppercase">
                        <FluctuatingText text={topItem.title} />
                    </p>

                    <div className="mb-8 flex flex-col items-center gap-6">
                        <MetricsBoard
                            growth={topItem.growth}
                            engagement={topItem.engagement}
                            daily={topItem.dailyViews}
                        />
                        <div className="flex flex-col items-center">
                            <div className="mb-2 text-[8px] tracking-[0.4em] text-white/20 uppercase font-bold">
                                Analysis: 7D Trend
                            </div>
                            <TrendChart data={topItem.history} width={400} height={60} color="#60a5fa" />
                        </div>
                    </div>

                    <div
                        className="group relative w-full max-w-lg aspect-video overflow-hidden border border-white/5 bg-black"
                    >
                        <DottedImage src={topItem.thumbnail} />
                        <div className="absolute inset-0 bg-black/20 transition-opacity group-hover:opacity-0 pointer-events-none" />
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
