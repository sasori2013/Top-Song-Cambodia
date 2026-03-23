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
    const displayTrend = (trend && trend.length > 0) ? trend : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const maxVal = Math.max(...displayTrend, 1);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="w-full max-w-4xl mx-auto mb-12 md:mb-16 p-8 relative overflow-hidden"
        >
            <div className="relative z-10 flex flex-col items-center">
                <header className="flex flex-col items-center mb-12 text-center">
                    {/* Size/Color/Font matched to Daily Heat Ranking title */}
                    <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] text-white uppercase pl-[0.8em]">
                        Heat Index Status
                    </h2>
                </header>
                
                <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 mb-12 w-full">
                    {/* Velocity Number - Font matched to Artist (font-black) */}
                    <div className="flex flex-col items-center md:items-start">
                        <div className="text-7xl md:text-9xl font-black text-white italic tracking-tighter leading-none">
                            {growth > 0 && <span className="text-4xl md:text-6xl text-white/30 mr-1 not-italic">+</span>}
                            <RollingValue value={growth} suffix="%" />
                        </div>
                        <p className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-[0.5em] mt-6 ml-1">
                            Velocity Index <span className="text-white/10 ml-2 font-mono">7D TRD</span>
                        </p>
                    </div>

                    {/* Trend Graph - Particle colors gradient */}
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
                                        // Gradient matching particles cyan/blue
                                        className="w-full bg-gradient-to-t from-[#00E5FF]/10 via-[#00E5FF]/40 to-[#00E5FF] hover:to-white rounded-t-sm transition-all duration-300"
                                    />
                                    {/* Tooltip on hover */}
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-all duration-300 pointer-events-none z-20">
                                        <div className="bg-black/80 backdrop-blur-md px-2 py-1 rounded border border-[#00E5FF]/30 text-[9px] font-mono text-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                                            {val.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-8 flex justify-between items-center border-t border-white/10 pt-4">
                            <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em] font-mono whitespace-nowrap">
                                14 Day Pulse Monitor
                            </span>
                            <div className="flex gap-2 items-center">
                                <div className="w-1 h-1 bg-[#00E5FF] rounded-full animate-pulse shadow-[0_0_8px_#00E5FF]" />
                                <span className="text-[8px] text-white/10 font-bold uppercase tracking-widest">Live</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-px h-16 bg-gradient-to-b from-white/20 via-white/5 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.1)]" />
            </div>
        </motion.div>
    );
};
