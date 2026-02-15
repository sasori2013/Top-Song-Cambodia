'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AuraR3F } from './AuraR3F';
import { RankingStats } from '@/lib/types';

interface PageHeaderProps {
    stats?: RankingStats;
}

const RollingNumber: React.FC<{ value: number; label: string }> = ({ value, label }) => {
    const [displayValue, setDisplayValue] = React.useState(0);

    React.useEffect(() => {
        let start = 0;
        const end = value;
        if (end === 0) return;

        const duration = 2000;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            const current = Math.floor(easeOutExpo(progress) * end);

            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value]);

    return (
        <div className="flex flex-col items-center px-4 md:px-8 border-r border-white/5 last:border-r-0">
            <div className="text-[8px] md:text-[10px] font-bold tracking-[0.4em] text-white/20 uppercase mb-1">
                {label}
            </div>
            <div className="text-xl md:text-2xl font-black text-white tabular-nums tracking-tighter">
                {displayValue.toLocaleString()}
            </div>
        </div>
    );
};

export const PageHeader: React.FC<PageHeaderProps> = ({ stats }) => {
    const [syncProgress, setSyncProgress] = React.useState(0);
    const [dateString, setDateString] = React.useState('');

    // Fallback values if stats are not yet provided by API
    const displayStats = stats || {
        totalArtists: 124,
        totalProductions: 12
    };

    const [showTitle, setShowTitle] = React.useState(false);

    React.useEffect(() => {
        const updateDate = () => {
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const formatted = `${now.getFullYear()} ${pad(now.getMonth() + 1)} ${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
            setDateString(formatted);
        };

        updateDate();
        const interval = setInterval(updateDate, 1000);

        const duration = 4000;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

            setSyncProgress(easeOutExpo(progress));

            // Show title after 2.5s
            if (elapsed > 2500) {
                setShowTitle(true);
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
        return () => clearInterval(interval);
    }, []);

    return (
        <section className="relative flex min-h-[90vh] flex-col items-center justify-center pt-32 pb-32 text-center overflow-hidden">
            <AuraR3F color="rgba(255, 255, 255, 0.2)" fullscreen progress={syncProgress} />

            {/* Title & Subtitle - Delayed Entrance */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: showTitle ? 1 : 0, y: showTitle ? 0 : 10 }}
                transition={{ duration: 1 }}
                className="mb-24 z-10"
            >
                <h1 className="text-6xl md:text-9xl font-bold text-white tracking-tighter mb-8 leading-[0.9]">
                    HEAT
                </h1>
                <p className="text-[12px] font-medium tracking-[0.5em] text-white/50 uppercase">
                    AI DRIVEN CAMBODIA MUSIC ANALYSIS
                </p>
            </motion.div>

            {/* Real-time Stats & Date Monitor - Visible Early */}
            <div className="flex flex-col items-center z-10 mt-8">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className="mb-6"
                >
                    <div className="inline-block px-4 py-1.5 border border-white/20 bg-gradient-to-r from-white/10 via-white/5 to-white/10 backdrop-blur-md rounded-full">
                        <span className="text-[10px] font-normal tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-400 to-white font-mono">
                            {dateString || '2026 00 00 00:00:00'}
                        </span>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 1 }}
                    className="flex justify-center items-center py-4"
                >
                    <div className="flex flex-col items-center px-6 md:px-12 border-r border-white/10 last:border-r-0">
                        <div className="text-[9px] md:text-[11px] font-black tracking-[0.4em] text-white/90 uppercase mb-2 drop-shadow-md">
                            ARTISTS
                        </div>
                        <div className="text-2xl md:text-4xl font-normal text-white tabular-nums tracking-tighter">
                            {Math.floor(syncProgress * displayStats.totalArtists).toLocaleString()}
                        </div>
                    </div>
                    <div className="flex flex-col items-center px-6 md:px-12 border-r border-white/10 last:border-r-0">
                        <div className="text-[9px] md:text-[11px] font-black tracking-[0.4em] text-white/90 uppercase mb-2 drop-shadow-md">
                            LABELS
                        </div>
                        <div className="text-2xl md:text-4xl font-normal text-white tabular-nums tracking-tighter">
                            {Math.floor(syncProgress * displayStats.totalProductions).toLocaleString()}
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
