'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface MetricProps {
    label: string;
    value: string | number;
    sub?: string;
}

const MetricItem: React.FC<MetricProps> = ({ label, value, sub }) => (
    <div className="flex flex-col items-center px-4 border-r border-white/5 last:border-r-0">
        <span className="text-[7px] tracking-[0.3em] font-bold text-white/20 uppercase mb-1">
            {label}
        </span>
        <span className="text-xs font-mono text-white/70 tabular-nums tracking-tighter">
            {value}
            {sub && <span className="text-[8px] text-white/30 ml-0.5">{sub}</span>}
        </span>
    </div>
);

export const MetricsBoard: React.FC<{
    growth: number;
    engagement: number;
    daily: number;
    className?: string;
}> = ({ growth, engagement, daily, className = "" }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className={`flex items-center justify-center bg-white/[0.02] border border-white/5 py-3 rounded-sm ${className}`}
        >
            <MetricItem label="Velocity" value={`+${growth}`} sub="%" />
            <MetricItem label="Reaction" value={engagement} sub="%" />
            <MetricItem label="Daily_FLX" value={daily.toLocaleString()} />
        </motion.div>
    );
};
