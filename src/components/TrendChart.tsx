'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface TrendChartProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
    data,
    width = 300,
    height = 50,
    color = "#ffffff"
}) => {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const padding = 5;

    // Scale functions
    const getX = (index: number) => (index / (data.length - 1)) * width;
    const getY = (value: number) => {
        const range = max - min || 1;
        return height - padding - ((value - min) / range) * (height - padding * 2);
    };

    // Construct SVG path
    const points = data.map((val, i) => `${getX(i)},${getY(val)}`);
    const pathData = `M ${points.join(' L ')}`;

    // Area path
    const areaPath = `${pathData} L ${getX(data.length - 1)},${height} L ${getX(0)},${height} Z`;

    return (
        <div className="relative" style={{ width, height }}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Fill Area */}
                <motion.path
                    d={areaPath}
                    fill="url(#trendGradient)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.5 }}
                />

                {/* Trend Line */}
                <motion.path
                    d={pathData}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#glow)"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.6 }}
                    transition={{ duration: 3.0, ease: "easeInOut" }}
                />

                {/* Last point dot */}
                <motion.circle
                    cx={getX(data.length - 1)}
                    cy={getY(data[data.length - 1])}
                    r="2"
                    fill={color}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 2.8, duration: 0.5 }}
                />
            </svg>
        </div>
    );
};
