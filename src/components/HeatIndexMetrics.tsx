'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface HeatIndexMetricsProps {
    growth?: number;
    trend?: number[];
    weeklyGenreViews?: { genre: string; views: number }[];
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
            setDisplayValue(easeOutExpo(progress) * end);
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <span className="tabular-nums flex items-baseline justify-center">
            {displayValue.toFixed(displayValue > 99 ? 0 : 1)}
            {suffix && (
                <span className="text-white/55 ml-2 relative inline-flex items-start">
                    {suffix.includes('%') && <span className="text-[0.4em] md:text-[0.3em] self-center">%</span>}
                    {suffix.includes('*') && (
                        <span className="text-[11px] md:text-[13px] text-white/65 leading-none select-none absolute -right-3 -top-1 md:-right-4 md:top-1 font-bold">*</span>
                    )}
                </span>
            )}
        </span>
    );
};

const formatCompactNumber = (number: number) => {
    if (number < 1000) return number.toString();
    if (number < 1000000) return (number / 1000).toFixed(number < 10000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return (number / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
};

const SHORT_GENRE: Record<string, string> = {
    'Hip-hop & Rap':     'HIP-HOP',
    'Pop':               'POP',
    'Ballad':            'BALLAD',
    'Traditional Khmer': 'TRAD',
    'Dance & EDM':       'EDM',
    'R&B & Soul':        'R&B',
    'Rock':              'ROCK',
    'Other':             'OTHER',
};

const fmtViews = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
  : n >= 1_000     ? Math.round(n / 1_000) + 'K'
  : String(n);

export const HeatIndexMetrics: React.FC<HeatIndexMetricsProps> = ({ growth = 0, trend = [], weeklyGenreViews = [] }) => {
    const displayTrend = (trend && trend.length > 0) ? trend : [0, 0, 0, 0, 0, 0, 0, 0];
    const maxVal = Math.max(...displayTrend, 1);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="w-full max-w-xl mx-auto p-6 md:p-8 relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md rounded-xl font-outfit"
        >
            <div className="relative z-10 flex flex-col items-center">
                <div className="flex items-center justify-between mb-6 w-full">
                    <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/80">WEEKLY TRAFFIC</h2>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                        <span className="text-[7px] text-white/45 font-bold uppercase tracking-widest font-mono">PULSE</span>
                    </div>
                </div>

                <div className="flex flex-col items-stretch gap-8 mb-6 w-full">
                    <div className="flex flex-col items-center text-center text-white">
                        <div className="text-5xl md:text-6xl font-extralight tracking-tighter leading-none tabular-nums flex items-center justify-center">
                            {growth > 0 && <span className="text-2xl md:text-3xl text-white/55 mr-1">+</span>}
                            <RollingValue value={growth} suffix="%*" />
                        </div>
                        <p className="text-[8px] md:text-[9px] font-bold text-white/55 uppercase tracking-[0.2em] mt-4">
                            WEEKLY COMPARISON <span className="text-white/45 ml-1 font-mono">VS LAST WEEK</span>
                        </p>
                    </div>

                    <div className="w-full pt-4 border-t border-white/5">
                        <div className="flex flex-col h-full">
                            <div className="flex items-end justify-between h-24 md:h-32 gap-3 md:gap-4 px-2">
                                {displayTrend.map((val, i) => (
                                    <div key={i} className="flex-1 flex flex-col justify-end items-center h-full group/bar relative">
                                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-75 group-hover/bar:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                                            <div className="text-[8px] font-mono text-white/95 font-black whitespace-nowrap">
                                                {formatCompactNumber(val)}
                                            </div>
                                        </div>
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            whileInView={{ height: `${(val / maxVal) * 100}%`, opacity: 1 }}
                                            transition={{ duration: 1, delay: 0.4 + i * 0.1, ease: [0.33, 1, 0.68, 1] }}
                                            className="w-full bg-gradient-to-t from-white/5 via-white/20 to-white/50 hover:to-white/70 rounded-t-sm transition-colors duration-300"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between px-2 mt-3">
                                {displayTrend.map((_, i) => {
                                    const total = displayTrend.length;
                                    let label = "";
                                    let opacity = "opacity-45";
                                    if (i === total - 1) { label = "THIS WEEK"; opacity = "opacity-85 font-bold"; }
                                    else if (i === total - 2) { label = "LAST WEEK"; opacity = "opacity-65"; }
                                    else if (i === 0) { label = `${total - 1}W AGO`; }
                                    else if ((total - 1 - i) % 2 === 0) { label = `${total - 1 - i}W`; }
                                    return (
                                        <div key={i} className={`flex-1 text-center text-[7px] font-black tracking-tighter ${opacity} text-white truncate`}>
                                            {label}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mt-8 flex justify-between items-center border-t border-white/5 pt-4">
                            <span className="text-[9px] text-white/60 font-black uppercase tracking-[0.3em] font-mono whitespace-nowrap">
                                WEEKLY HEAT VOLUME
                            </span>
                            <div className="flex gap-2 items-center">
                                <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse opacity-60" />
                                <span className="text-[8px] text-white/45 font-bold uppercase tracking-widest whitespace-nowrap">Pulse-check</span>
                            </div>
                        </div>
                    </div>

                    {/* Genre breakdown */}
                    {weeklyGenreViews.length > 0 && (() => {
                        const total = weeklyGenreViews.reduce((s, g) => s + g.views, 0) || 1;
                        return (
                            <div className="w-full border-t border-white/5 pt-6">
                                <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.3em] font-mono mb-4">
                                    GENRE SPLIT
                                </p>
                                <div className="flex flex-col gap-2.5">
                                    {weeklyGenreViews.map((g, i) => {
                                        const pct = g.views / total;
                                        return (
                                            <div key={g.genre} className="flex items-center gap-3">
                                                <span className="text-[8px] font-black font-mono text-white/60 w-14 shrink-0 text-right tracking-wider">
                                                    {SHORT_GENRE[g.genre] ?? g.genre.slice(0, 6).toUpperCase()}
                                                </span>
                                                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full rounded-full bg-white"
                                                        style={{ opacity: 0.25 + pct * 0.65 }}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${pct * 100}%` }}
                                                        viewport={{ once: true }}
                                                        transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.33, 1, 0.68, 1] }}
                                                    />
                                                </div>
                                                <span className="text-[8px] font-mono text-white/50 w-10 shrink-0">
                                                    {fmtViews(g.views)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </motion.div>
    );
};
