'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DailyActionsProps {
    count?: {
        views: number; likes: number; comments: number;
        prev?: { views: number; likes: number; comments: number };
        sentiment?: { positive: number; neutral: number; negative: number; songs: number };
    };
}

const fmt = (n: number) =>
    n >= 1e6  ? (n / 1e6).toFixed(1)  + 'M'
  : n >= 1000 ? (n / 1000).toFixed(1) + 'K'
  : n.toLocaleString();

// ─── Single donut gauge ───────────────────────────────────────────────────────
interface GaugeProps { label: string; today: number; prev: number; index: number; }

const SIZE   = 110;
const CX     = SIZE / 2;
const R_OUT  = 44;
const R_IN   = 28;
const SW_OUT = 11;
const SW_IN  = 9;

const Gauge: React.FC<GaugeProps> = ({ label, today, prev, index }) => {
    const maxVal   = Math.max(today, prev, 1);
    const todayPct = today / maxVal;
    const prevPct  = prev  / maxVal;
    const isUp     = today >= prev;
    const deltaPct = prev > 0 ? ((today - prev) / prev * 100).toFixed(1) : '—';
    const circOut  = 2 * Math.PI * R_OUT;
    const circIn   = 2 * Math.PI * R_IN;
    const delay    = index * 0.3;
    const CYCLE    = 10;

    return (
        <div className="flex flex-col items-center gap-2">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                <circle cx={CX} cy={CX} r={R_OUT} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={SW_OUT} />
                <circle cx={CX} cy={CX} r={R_IN}  fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={SW_IN} />
                <motion.circle cx={CX} cy={CX} r={R_IN}
                    fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={SW_IN} strokeLinecap="butt"
                    strokeDasharray={circIn}
                    animate={{ strokeDashoffset: [circIn, circIn * (1 - prevPct)] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: CYCLE - 2.2, delay: delay + 0.15, ease: [0.33, 1, 0.68, 1] }}
                    style={{ rotate: '-90deg', transformOrigin: `${CX}px ${CX}px` }}
                />
                <motion.circle cx={CX} cy={CX} r={R_OUT}
                    fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth={SW_OUT} strokeLinecap="butt"
                    strokeDasharray={circOut}
                    animate={{ strokeDashoffset: [circOut, circOut * (1 - todayPct)] }}
                    transition={{ duration: 2.2, repeat: Infinity, repeatDelay: CYCLE - 2.2, delay, ease: [0.33, 1, 0.68, 1] }}
                    style={{ rotate: '-90deg', transformOrigin: `${CX}px ${CX}px` }}
                />
                <text x={CX} y={CX + 5} textAnchor="middle"
                    style={{ fontSize: '11px', fontWeight: 900, fill: isUp ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)', letterSpacing: '0.02em' }}>
                    {isUp ? '▲' : '▼'}{Math.abs(Number(deltaPct))}%
                </text>
            </svg>
            <span className="text-2xl font-black font-mono text-white tracking-tight leading-none">{fmt(today)}</span>
            <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">{label}</span>
                <span className="text-[8px] font-mono text-white/20">{fmt(prev)}</span>
            </div>
        </div>
    );
};

// ─── Main panel ───────────────────────────────────────────────────────────────
export const DailyActions: React.FC<DailyActionsProps> = ({ count }) => {
    const views     = count?.views    ?? 0;
    const likes     = count?.likes    ?? 0;
    const comments  = count?.comments ?? 0;
    const prev      = count?.prev;
    const sentiment = count?.sentiment;

    const metrics = [
        { label: 'VIEWS',    today: views,    prev: prev?.views    ?? 0 },
        { label: 'LIKES',    today: likes,    prev: prev?.likes    ?? 0 },
        { label: 'COMMENTS', today: comments, prev: prev?.comments ?? 0 },
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="w-full p-6 md:p-8 relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md rounded-xl font-['Outfit']"
        >
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/60">DAILY ACTIONS</h2>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                    <span className="text-[7px] text-white/20 font-bold uppercase tracking-widest font-mono">LIVE</span>
                </div>
            </div>

            <div className="flex justify-around items-start">
                {metrics.map((m, i) => <Gauge key={m.label} {...m} index={i} />)}
            </div>

            {/* Today / Yesterday legend */}
            <div className="mt-6 flex justify-center gap-6 border-t border-white/5 pt-4">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-[3px] rounded-full bg-white/90" />
                    <span className="text-[7px] font-bold text-white/30 uppercase tracking-widest">Today</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-[3px] rounded-full bg-white/28" />
                    <span className="text-[7px] font-bold text-white/30 uppercase tracking-widest">Yesterday</span>
                </div>
            </div>

            {/* Comment sentiment */}
            {sentiment && (
                <div className="mt-6 border-t border-white/5 pt-5">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] font-mono">
                            Comment Mood
                        </p>
                        <span className="text-[8px] font-mono text-white/20">
                            {sentiment.songs} songs
                        </span>
                    </div>

                    {/* Stacked bar */}
                    <div className="flex h-2 w-full rounded-full overflow-hidden gap-px mb-3">
                        <motion.div
                            className="bg-white/80 rounded-l-full"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${sentiment.positive}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.0, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
                        />
                        <motion.div
                            className="bg-white/25"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${sentiment.neutral}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.0, delay: 0.35, ease: [0.33, 1, 0.68, 1] }}
                        />
                        <motion.div
                            className="bg-white/10 rounded-r-full"
                            initial={{ width: 0 }}
                            whileInView={{ width: `${sentiment.negative}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1.0, delay: 0.5, ease: [0.33, 1, 0.68, 1] }}
                        />
                    </div>

                    {/* Labels */}
                    <div className="flex justify-between">
                        {[
                            { label: 'Positive', value: sentiment.positive, op: 'text-white/60' },
                            { label: 'Neutral',  value: sentiment.neutral,  op: 'text-white/30' },
                            { label: 'Negative', value: sentiment.negative, op: 'text-white/20' },
                        ].map(({ label, value, op }) => (
                            <div key={label} className="flex flex-col items-center gap-0.5">
                                <span className={`text-[13px] font-black font-mono ${op}`}>{value}%</span>
                                <span className="text-[7px] font-bold text-white/20 uppercase tracking-widest">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
};
