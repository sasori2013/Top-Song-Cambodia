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
            {suffix && <span className="text-white/30 ml-1">{suffix}</span>}
        </span>
    );
};

const formatCompactNumber = (number: number) => {
    if (number < 1000) return number.toString();
    if (number < 1000000) return (number / 1000).toFixed(number < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
};

export const HeatIndexMetrics: React.FC<HeatIndexMetricsProps> = ({ growth = 0, trend = [] }) => {
    // Trend is now weekly (Last 8-10 weeks)
    const displayTrend = (trend && trend.length > 0) ? trend : [0, 0, 0, 0, 0, 0, 0, 0];
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
                <header className="flex flex-col items-center mb-12 text-center text-white">
                    <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] uppercase pl-[0.8em]">
                        Heat Index Status
                    </h2>
                </header>
                
                <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 mb-12 w-full">
                    {/* Growth Number - Weekly Comparison */}
                    <div className="flex flex-col items-center md:items-start text-white">
                        <div className="text-7xl md:text-9xl font-extralight tracking-tighter leading-none tabular-nums">
                            {growth > 0 && <span className="text-4xl md:text-6xl text-white/40 mr-1">+</span>}
                            <RollingValue value={growth} suffix="%" />
                        </div>
                        <p className="text-[10px] md:text-[11px] font-bold text-white/60 uppercase tracking-[0.5em] mt-6 ml-1">
                            WEEKLY COMPARISON <span className="text-white/30 ml-2 font-mono">VS LAST WEEK</span>
                        </p>
                    </div>

                    {/* Trend Graph - Weekly Volume */}
                    <div className="flex-1 w-full max-w-md pt-8">
                        <div className="flex flex-col h-full">
                            <div className="flex items-end justify-between h-24 md:h-32 gap-3 md:gap-4 px-2">
                                {displayTrend.map((val, i) => (
                                    <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group/bar relative">
                                        {/* Abbreviated value displayed permanently */}
                                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-60 group-hover/bar:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                                            <div className="text-[8px] font-mono text-[#AEEFFF] font-black whitespace-nowrap">
                                                {formatCompactNumber(val)}
                                            </div>
                                        </div>
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            whileInView={{ height: `${(val / maxVal) * 100}%`, opacity: 1 }}
                                            transition={{ 
                                                duration: 1, 
                                                delay: 0.4 + i * 0.1,
                                                ease: [0.33, 1, 0.68, 1]
                                            }}
                                            className="w-full bg-gradient-to-t from-[#AEEFFF]/5 via-[#AEEFFF]/20 to-[#AEEFFF]/60 hover:to-white rounded-t-sm transition-all duration-300"
                                        />
                                    </div>
                                ))}
                            </div>
                            {/* Week Labels */}
                            <div className="flex justify-between px-2 mt-3">
                                {displayTrend.map((_, i) => {
                                    const total = displayTrend.length;
                                    let label = "";
                                    let opacity = "opacity-20";
                                    
                                    if (i === total - 1) {
                                        label = "THIS WEEK";
                                        opacity = "opacity-60";
                                    } else if (i === total - 2) {
                                        label = "LAST WEEK";
                                        opacity = "opacity-40";
                                    } else if (i === 0) {
                                        label = `${total - 1}W AGO`;
                                    } else if ((total - 1 - i) % 2 === 0) {
                                        label = `${total - 1 - i}W`;
                                    }

                                    return (
                                        <div key={i} className={`flex-1 text-center text-[7px] font-black tracking-tighter ${opacity} text-white truncate`}>
                                            {label}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mt-8 flex justify-between items-center border-t border-white/5 pt-4">
                            <span className="text-[9px] text-white/50 font-black uppercase tracking-[0.3em] font-mono whitespace-nowrap">
                                WEEKLY HEAT VOLUME
                            </span>
                            <div className="flex gap-2 items-center">
                                <div className="w-1 h-1 bg-[#AEEFFF] rounded-full animate-pulse opacity-40" />
                                <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest whitespace-nowrap">Pulse-check</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-px h-16 bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
            </div>
        </motion.div>
    );
};
