'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface HeatIndexMetricsProps {
    growth?: number;
    trend?: number[];
}

export const HeatIndexMetrics: React.FC<HeatIndexMetricsProps> = ({ growth = 0, trend = [] }) => {
    // Generate some mock data if trend is empty for design purposes during dev
    const displayTrend = trend.length > 0 ? trend : [10, 15, 8, 12, 20, 18, 25, 22, 30, 28, 35, 32, 40, 38];
    const maxVal = Math.max(...displayTrend, 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="flex flex-col items-center mb-12"
        >
            <div className="flex flex-col items-center mb-6">
                <span className="text-[10px] font-bold tracking-[0.5em] text-white/30 uppercase mb-2">
                    Heat Index Velocity
                </span>
                <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-black text-white tracking-tighter tabular-nums">
                        {growth > 0 ? `+${growth}` : growth}%
                    </span>
                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        vs prev week
                    </span>
                </div>
            </div>

            {/* Bar Graph */}
            <div className="flex items-end gap-1 h-12 md:h-16">
                {displayTrend.slice(-14).map((val, i) => (
                    <motion.div
                        key={i}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: `${(val / maxVal) * 100}%`, opacity: 1 }}
                        transition={{ 
                            duration: 0.8, 
                            delay: 0.5 + i * 0.05,
                            ease: "easeOut"
                        }}
                        className="w-1 md:w-1.5 bg-gradient-to-t from-white/5 to-white/40 rounded-full"
                    />
                ))}
            </div>
            
            <div className="mt-4 w-px h-12 bg-gradient-to-b from-white/20 to-transparent" />
        </motion.div>
    );
};
