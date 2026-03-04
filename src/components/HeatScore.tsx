'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface HeatScoreProps {
    score: number;
    rank?: number;
    size?: 'sm' | 'lg';
    color?: string;
    className?: string;
    disableAnimation?: boolean;
}

export const HeatScore: React.FC<HeatScoreProps> = ({
    score,
    rank,
    size = 'lg',
    color = "#60a5fa",
    className = "",
    disableAnimation = false
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
            animate={disableAnimation ? {} : {
                y: [0, -4, 0],
            }}
            transition={{
                duration: 4,
                repeat: Infinity,
                repeatDelay: 0,
                ease: "easeInOut"
            }}
        >
            {/* Rank Label if exists */}
            {rank !== undefined && (
                <div
                    className={`${isLg ? 'text-[11px]' : 'text-[8px]'} font-bold tracking-[0.3em] mb-2 opacity-80`}
                    style={{ color }}
                >
                    DAILY RANK {rank < 10 ? `0${rank}` : rank}
                </div>
            )}

            {/* Pulsating Glow Backdrop */}
            {!disableAnimation && (
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
            )}

            <div className="relative flex flex-col items-center">
                <div className="flex items-baseline gap-1">
                    <span className={`${isLg ? 'text-4xl' : 'text-xl'} font-extralight text-white tracking-tighter tabular-nums`}>
                        {displayScore.toFixed(displayScore > 99 ? 0 : 1)}
                    </span>
                    <span
                        className={`${isLg ? 'text-[12px]' : 'text-[9px]'} font-bold opacity-90`}
                        style={{ color }}
                    >
                        HEAT POINT <span className="text-[1.4em] leading-none align-middle ml-0.5">*</span>
                    </span>
                </div>

                {/* Underline pulse */}
                {!disableAnimation && (
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
                )}
            </div>
        </motion.div>
    );
};
