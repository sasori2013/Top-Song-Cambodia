'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface HeatIndexMetricsProps {
    growth?: number;
    trend?: number[];
}

const RollingValue: React.FC<{ value: number; duration?: number; suffix?: string }> = ({ value, duration = 2000, suffix = "" }) => {
    const [displayValue, setDisplayValue] = React.useState(0);

    React.useEffect(() => {
        let start = 0;
        const end = value;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            const current = easeOutExpo(progress) * end;

            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <span className="tabular-nums">
            {displayValue.toFixed(displayValue > 99 ? 0 : 1)}
            {suffix && <span className="text-white/30 ml-2">{suffix}</span>}
        </span>
    );
};

export const HeatIndexMetrics: React.FC<HeatIndexMetricsProps> = ({ growth = 0, trend = [] }) => {
    // Fallback data if no trend is provided (keeps it alive while syncing)
    const displayTrend = (trend && trend.length > 0) ? trend : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const maxVal = Math.max(...displayTrend, 1);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="w-full max-w-4xl mx-auto mb-20 p-8 md:p-12 border border-white/5 bg-black relative overflow-hidden"
        >
            {/* Background Aesthetics to match RankingCard */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
                backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
                backgroundSize: '24px 24px'
            }} />

            <div className="relative z-10 flex flex-col items-center">
                <header className="flex flex-col items-center mb-10 text-center">
                    <h2 className="text-[11px] md:text-[13px] font-bold tracking-[0.6em] text-white/40 uppercase mb-4">
                        Heat Index Status
                    </h2>
                    <div className="h-px w-12 bg-white/20" />
                </header>
                
                <div className="flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20 mb-12 w-full">
                    {/* Velocity Number - Changed from font-black to font-bold to match Ranking */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="text-7xl md:text-8xl lg:text-9xl font-bold text-white tracking-tighter leading-none italic">
                            {growth > 0 && <span className="text-4xl md:text-6xl text-white/30 mr-1 not-italic">+</span>}
                            <RollingValue value={growth} suffix="%" />
                        </div>
                        <p className="text-[10px] md:text-[11px] font-bold text-white/20 uppercase tracking-[0.5em] mt-6 ml-1">
                            Velocity Index <span className="text-white/40 ml-2">7D TRD</span>
                        </p>
                    </div>

                    {/* Trend Graph */}
                    <div className="flex-1 w-full max-w-md">
                        <div className="flex items-end justify-between h-24 md:h-32 gap-1.5 md:gap-2 px-2">
                            {displayTrend.slice(-14).map((val, i) => (
                                <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group/bar relative">
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        whileInView={{ height: `${(val / maxVal) * 100}%`, opacity: 1 }}
                                        transition={{ 
                                            duration: 1, 
                                            delay: 0.4 + i * 0.05,
                                            ease: [0.33, 1, 0.68, 1]
                                        }}
                                        className="w-full bg-white/[0.1] hover:bg-white/40 rounded-t-sm transition-all duration-300"
                                    />
                                    {/* Tooltip on hover */}
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-all duration-300 pointer-events-none">
                                        <div className="bg-white/10 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[9px] font-mono text-white">
                                            {val.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-between items-center border-t border-white/5 pt-3">
                            <span className="text-[9px] text-white/10 font-bold uppercase tracking-[0.3em] font-mono whitespace-nowrap">
                                14 Day Pulse Monitor
                            </span>
                            <div className="flex gap-2">
                                <div className="w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6 mt-4">
                    <div className="w-px h-16 bg-gradient-to-b from-white/20 via-white/5 to-transparent" />
                    <span className="text-[10px] font-bold tracking-[0.8em] text-white pl-[0.8em] uppercase opacity-20">
                        Descending into Ranking
                    </span>
                </div>
            </div>
        </motion.div>
    );
};
