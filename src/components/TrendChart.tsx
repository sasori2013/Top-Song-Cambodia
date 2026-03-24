'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface TrendChartProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    heatScore?: number;
    isRank?: boolean;
}

export const TrendChart: React.FC<TrendChartProps> = ({
    data: rawData,
    width = 300,
    height = 50,
    color = "#ffffff",
    heatScore = 0,
    isRank = true // Default to true as per new requirement
}) => {
    const uniqueId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
    const gradientId = `gradient-${uniqueId}`;
    const filterId = `glow-${uniqueId}`;

    // 描画データがない場合は最下位(100)の平坦な線を生成
    const data = (!rawData || rawData.length === 0)
        ? [100, 100]
        : rawData.length === 1
            ? [rawData[0], rawData[0]]
            : rawData;

    // Rank グラフの場合、1を最高（最上部）、20を最低（最下部）とする
    // 20位以下はグラフの底を突き抜けて「圏外」へ抜ける表現にする
    const padding = 8; // 上下の余白

    // Normalize data for ranking (1 to 21)
    const normalizedData = isRank ? data.map(v => Math.min(Math.max(v, 1), 21)) : data;
    
    // Calculate dynamic vertical bounds
    const chartMin = Math.min(...normalizedData);
    const chartMax = Math.max(...normalizedData);
    const chartRange = chartMax - chartMin;

    const getX = (index: number) => (index / (data.length - 1)) * width;
    const getY = (value: number) => {
        const effectiveVal = isRank ? Math.min(Math.max(value, 1), 21) : value;
        
        if (isRank) {
            if (chartRange === 0) {
                // Stable rank: use global 1-20 scale to show its absolute level
                const globalRange = 20 - 1;
                return padding + ((effectiveVal - 1) / globalRange) * (height - padding * 2);
            }
            // Moving rank: use relative scale to amplify "ups and downs"
            return padding + ((effectiveVal - chartMin) / chartRange) * (height - padding * 2);
        }
        
        // Standard trend focus (higher is upper)
        const trendRange = chartRange || 1;
        return height - padding - ((effectiveVal - chartMin) / trendRange) * (height - padding * 2);
    };

    // Construct SVG path using straight lines for an "analytical" ranking feel
    const points = data.map((val, i) => ({ x: getX(i), y: getY(val) }));

    let pathData = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathData += ` L ${points[i].x},${points[i].y}`;
    }

    // Area path
    const areaPath = `${pathData} L ${getX(data.length - 1).toFixed(1)},${height} L ${getX(0).toFixed(1)},${height} Z`;

    const pathId = `path-${uniqueId}`;
    const strokeGradientId = `stroke-grad-${uniqueId}`;

    // Flow settings based on heatScore
    // Speed: higher score = faster flow = shorter duration, bounded between 2s and 12s
    const flowDuration = Math.max(2, Math.min(12, 14 - (heatScore / 10)));
    const glowOpacity = Math.min(1, 0.4 + (heatScore / 400));

    return (
        <div className="relative w-full overflow-hidden" style={{ height }}>
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <defs>
                    {/* Fill Area Gradient */}
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>

                    {/* Flowing Stroke Gradient */}
                    <linearGradient id={strokeGradientId} x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="userSpaceOnUse">
                        <motion.stop
                            offset="0%"
                            stopColor={color}
                            animate={{ offset: ["-100%", "200%"] }}
                            transition={{ duration: flowDuration, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.stop
                            offset="0%"
                            stopColor={color}
                            stopOpacity="0.3"
                            animate={{ offset: ["-110%", "190%"] }}
                            transition={{ duration: flowDuration, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.stop
                            offset="0%"
                            stopColor="#fff"
                            stopOpacity="0.9"
                            animate={{ offset: ["-105%", "195%"] }}
                            transition={{ duration: flowDuration, repeat: Infinity, ease: "linear" }}
                        />
                        <motion.stop
                            offset="0%"
                            stopColor={color}
                            stopOpacity="0.3"
                            animate={{ offset: ["-100%", "200%"] }}
                            transition={{ duration: flowDuration, repeat: Infinity, ease: "linear" }}
                        />
                    </linearGradient>

                    <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Fill Area - Only for trend, hide for rank */}
                {!isRank && (
                    <motion.path
                        d={areaPath}
                        fill={`url(#${gradientId})`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.5 }}
                    />
                )}

                {/* Background static line for consistency */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="1"
                    strokeOpacity="0.1"
                    strokeLinecap="round"
                />

                {/* Main Trend/Rank Line */}
                <motion.path
                    id={pathId}
                    d={pathData}
                    fill="none"
                    stroke={isRank ? "#ffffff" : `url(#${strokeGradientId})`}
                    strokeWidth={isRank ? "2" : "1.8"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={isRank ? "none" : `url(#${filterId})`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                        pathLength: 1,
                        opacity: isRank ? 0.8 : glowOpacity,
                    }}
                    transition={{
                        pathLength: { duration: 1.5, ease: "easeInOut" },
                        opacity: { duration: 1 }
                    }}
                />

                {/* All point dots for rank graph */}
                {isRank && points.map((p, i) => (
                    <motion.circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="2"
                        fill="#fff"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 1.5 + (i * 0.1) }}
                    />
                ))}

                {/* Pulsing Dot on Last Point (only if not rank or special focus) */}
                {!isRank && (
                    <motion.circle
                        cx={getX(data.length - 1)}
                        cy={getY(data[data.length - 1])}
                        r="2.5"
                        fill="#fff"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{
                            scale: [1, 1.4, 1],
                            opacity: 1,
                            filter: "drop-shadow(0 0 4px #fff)"
                        }}
                        transition={{
                            scale: { duration: flowDuration / 2, repeat: Infinity, ease: "easeInOut" },
                            delay: 1.5,
                            duration: 0.5
                        }}
                    />
                )}
            </svg>
        </div>
    );
};
