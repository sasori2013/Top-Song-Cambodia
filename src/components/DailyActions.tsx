'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DailyActionsProps {
    count?: number;
}

const CountUp: React.FC<{ value: number; duration?: number }> = ({ value, duration = 2200 }) => {
    const [display, setDisplay] = React.useState(0);

    React.useEffect(() => {
        if (value === 0) return;
        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutExpo = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(Math.round(easeOutExpo(progress) * value));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [value, duration]);

    return (
        <span className="tabular-nums">
            {display.toLocaleString()}
        </span>
    );
};

export const DailyActions: React.FC<DailyActionsProps> = ({ count = 0 }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
            className="w-full max-w-4xl mx-auto mb-12 md:mb-16 p-8 relative overflow-hidden"
        >
            <div className="relative z-10 flex flex-col items-center">
                <header className="flex flex-col items-center mb-10 text-center text-white">
                    <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] uppercase pl-[0.8em]">
                        DAILY ACTIONS
                    </h2>
                </header>

                <div className="flex flex-col items-center gap-3">
                    <div className="text-7xl md:text-9xl font-extralight tracking-tighter leading-none text-white">
                        <CountUp value={count} />
                    </div>
                    <p className="text-[10px] md:text-[11px] font-bold text-white/60 uppercase tracking-[0.5em] mt-4">
                        DATA POINTS FETCHED <span className="text-white/30 ml-2 font-mono">YESTERDAY</span>
                    </p>

                    <div className="flex gap-6 mt-6 border-t border-white/5 pt-5 w-full max-w-xs justify-center">
                        <div className="flex gap-2 items-center">
                            <div className="w-1 h-1 bg-[#AEEFFF] rounded-full animate-pulse opacity-40" />
                            <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest whitespace-nowrap">
                                AUTO PIPELINE
                            </span>
                        </div>
                    </div>
                </div>

                <div className="w-px h-16 bg-gradient-to-b from-white/10 via-white/5 to-transparent mt-10" />
            </div>
        </motion.div>
    );
};
