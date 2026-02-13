'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface HeatScoreProps {
    score: number;
    rank?: number;
    size?: 'sm' | 'lg';
    color?: string;
    className?: string;
}

export const HeatScore: React.FC<HeatScoreProps> = ({
    score,
    rank,
    size = 'lg',
    color = "#60a5fa",
    className = ""
}) => {
    const isLg = size === 'lg';
    const [displayScore, setDisplayScore] = React.useState(0);

    React.useEffect(() => {
        let start = 0;
        const end = score;
        const duration = 3000;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuad = (t: number) => t * (2 - t);
            const current = easeOutQuad(progress) * end;

            setDisplayScore(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [score]);

    return (
        <motion.div
            className={`relative flex flex-col items-center ${className}`}
            animate={{
                y: [0, -4, 0],
            }}
            transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
            }}
        >
            {/* Rank Label if exists */}
            {rank !== undefined && (
                <div
                    className={`${isLg ? 'text-[11px]' : 'text-[8px]'} font-bold tracking-[0.3em] mb-2 opacity-30`}
                    style={{ color }}
                >
                    DAILY RANK {rank < 10 ? `0${rank}` : rank}
                </div>
            )}

            {/* Pulsating Glow Backdrop */}
            <motion.div
                className="absolute inset-0 blur-xl rounded-full"
                style={{ backgroundColor: color, opacity: 0.1 }}
                animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.1, 0.25, 0.1],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            <div className="relative flex flex-col items-center">
                <div className="flex items-baseline gap-1">
                    <span className={`${isLg ? 'text-4xl' : 'text-xl'} font-bold text-white tracking-tighter tabular-nums`}>
                        {displayScore.toFixed(displayScore > 99 ? 0 : 1)}
                    </span>
                    <motion.span
                        className={`${isLg ? 'text-[10px]' : 'text-[7px]'} font-bold opacity-80`}
                        style={{ color }}
                        animate={{
                            opacity: [1, 0.5, 1],
                            skewX: [0, 10, -10, 0],
                        }}
                        transition={{
                            duration: 0.2,
                            repeat: Infinity,
                            repeatDelay: 3,
                        }}
                    >
                        HEAT POINT
                    </motion.span>
                </div>

                {/* Underline pulse */}
                <motion.div
                    className="h-px w-full mt-1"
                    style={{
                        background: `linear-gradient(to right, transparent, ${color}, transparent)`
                    }}
                    animate={{
                        opacity: [0.2, 0.8, 0.2],
                        scaleX: [0.8, 1.2, 0.8],
                        x: [-2, 2, -2],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />
            </div>
        </motion.div>
    );
};
