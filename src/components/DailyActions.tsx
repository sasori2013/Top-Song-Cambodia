'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DailyActionsProps {
    count?: { views: number; likes: number; comments: number };
}

const CountUp: React.FC<{ value: number; duration?: number }> = ({ value, duration = 2200 }) => {
    const [display, setDisplay] = React.useState(0);

    React.useEffect(() => {
        if (value === 0) return;
        const startTime = performance.now();
        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            setDisplay(Math.round(ease(progress) * value));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [value, duration]);

    return <span className="tabular-nums">{display.toLocaleString()}</span>;
};

const Metric: React.FC<{ value: number; label: string; labelJa: string; delay: number }> = ({ value, label, labelJa, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay }}
        className="flex flex-col items-center gap-2"
    >
        <div className="text-4xl md:text-6xl font-extralight tracking-tighter text-white leading-none">
            <CountUp value={value} duration={2000 + delay * 300} />
        </div>
        <p className="text-[9px] md:text-[10px] font-bold text-white/50 uppercase tracking-[0.4em]">
            {label}
        </p>
        <p className="text-[8px] text-white/25 tracking-widest">{labelJa}</p>
    </motion.div>
);

export const DailyActions: React.FC<DailyActionsProps> = ({ count }) => {
    const views    = count?.views    ?? 0;
    const likes    = count?.likes    ?? 0;
    const comments = count?.comments ?? 0;

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

                <div className="flex flex-row items-start justify-center gap-10 md:gap-20 w-full">
                    <Metric value={views}    label="VIEWS"    labelJa="再生数"   delay={0}   />
                    <Metric value={likes}    label="LIKES"    labelJa="いいね数" delay={0.2} />
                    <Metric value={comments} label="COMMENTS" labelJa="コメント" delay={0.4} />
                </div>

                <div className="mt-8 flex justify-center items-center border-t border-white/5 pt-5 w-full max-w-sm">
                    <div className="flex gap-2 items-center">
                        <div className="w-1 h-1 bg-[#AEEFFF] rounded-full animate-pulse opacity-40" />
                        <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest">
                            LATEST PIPELINE DATA
                        </span>
                    </div>
                </div>

                <div className="w-px h-16 bg-gradient-to-b from-white/10 via-white/5 to-transparent mt-6" />
            </div>
        </motion.div>
    );
};
