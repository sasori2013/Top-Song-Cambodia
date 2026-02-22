'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface TrendChartProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    heatScore?: number;
}

export const TrendChart: React.FC<TrendChartProps> = ({
    data: rawData,
    width = 300,
    height = 50,
    color = "#ffffff",
    heatScore = 0
}) => {
    const uniqueId = React.useId().replace(/[^a-zA-Z0-9]/g, '');
    const gradientId = `gradient-${uniqueId}`;
    const filterId = `glow-${uniqueId}`;

    // 描画データがない場合は中位の平坦な線を生成
    const data = (!rawData || rawData.length === 0)
        ? [50, 50]
        : rawData.length === 1
            ? [rawData[0], rawData[0]]
            : rawData;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const padding = 5;

    // Scale functions
    const getX = (index: number) => (index / (data.length - 1)) * width;
    const getY = (value: number) => {
        const range = (max - min) || 100;
        const baseOffset = (max === min) ? height / 2 : height - padding;
        if (max === min) return baseOffset;
        return height - padding - ((value - min) / range) * (height - padding * 2);
    };

    // Construct SVG path using smooth curves (simplified Catmull-Rom or Bezier approach)
    const points = data.map((val, i) => ({ x: getX(i), y: getY(val) }));

    let pathData = `M ${points[0].x},${points[0].y}`;
    if (points.length > 2) {
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const controlX = (p0.x + p1.x) / 2;
            pathData += ` C ${controlX},${p0.y} ${controlX},${p1.y} ${p1.x},${p1.y}`;
        }
    } else {
        // Just 2 points: use a slight curve for "shinari"
        const p0 = points[0];
        const p1 = points[1];
        const cx1 = p0.x + (p1.x - p0.x) * 0.4;
        const cx2 = p0.x + (p1.x - p0.x) * 0.6;
        pathData += ` C ${cx1},${p0.y} ${cx2},${p1.y} ${p1.x},${p1.y}`;
    }

    // Area path
    const areaPath = `${pathData} L ${getX(data.length - 1).toFixed(1)},${height} L ${getX(0).toFixed(1)},${height} Z`;

    const pathId = `path-${uniqueId}`;
    const strokeGradientId = `stroke-grad-${uniqueId}`;

    // Flow settings based on heatScore
    // Speed: higher score = faster flow, bounded between 2s and 12s
    const flowDuration = Math.max(2, Math.min(12, 14 - (heatScore / 10)));
    const glowOpacity = Math.min(1, 0.4 + (heatScore / 400));

    return (
        <div className="relative w-full" style={{ height }}>
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

                {/* Fill Area */}
                <motion.path
                    d={areaPath}
                    fill={`url(#${gradientId})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                />

                {/* Background static line for consistency */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.2"
                    strokeOpacity="0.1"
                    strokeLinecap="round"
                />

                {/* Flowing Trend Line */}
                <motion.path
                    id={pathId}
                    d={pathData}
                    fill="none"
                    stroke={`url(#${strokeGradientId})`}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#${filterId})`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                        pathLength: 1,
                        opacity: glowOpacity,
                    }}
                    transition={{
                        pathLength: { duration: 1.5, ease: "easeInOut" },
                        opacity: { duration: 1 }
                    }}
                />

                {/* Last point dot - pulses with sync */}
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
            </svg>
        </div>
    );
};
