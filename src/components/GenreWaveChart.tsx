'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GenreTrendData } from '@/lib/types';

const ROWS        = 14;
const CELL        = 12;
const GAP         = 2;
const STEP        = CELL + GAP;
const LABEL_H     = 20;
const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Heatmap: 0 → dark-blue → red → yellow → white
function heat(t: number): string {
  if (t <= 0.005) return 'rgba(255,255,255,0.05)'; // empty placeholder
  if (t < 0.18) {
    const s = t / 0.18;
    return `rgba(10,${Math.round(20*s)},${Math.round(160*s)},${0.25+s*0.45})`;
  }
  if (t < 0.50) {
    const s = (t - 0.18) / 0.32;
    return `rgba(${Math.round(10+s*210)},${Math.round(20-s*20)},${Math.round(160-s*160)},${0.70+s*0.1})`;
  }
  if (t < 0.78) {
    const s = (t - 0.50) / 0.28;
    return `rgba(218,${Math.round(s*170)},0,${0.80+s*0.10})`;
  }
  const s = (t - 0.78) / 0.22;
  return `rgba(255,${Math.round(170+s*85)},${Math.round(s*220)},${0.90+s*0.10})`;
}

interface Props { data?: GenreTrendData }

export const GenreWaveChart: React.FC<Props> = ({ data }) => {

  if (!data) return null;

  const series = data.series.filter(s => s.genre !== 'Dance & EDM');
  const months = data.months;
  const n     = months.length;
  const g     = series.length;
  const gridW = n * STEP - GAP;
  const gridH = ROWS * STEP - GAP;
  const vbH   = gridH + LABEL_H;

  // Global max for heatmap normalization
  const allVals = series.flatMap(s => s.values);
  const globalMax = Math.max(...allVals, 1);

  // Per-month: distribute ROWS cells among genres by proportion
  const monthData = months.map((_, mi) => {
    const vals  = series.map(s => s.values[mi] ?? 0);
    const total = vals.reduce((a, b) => a + b, 0);
    if (total === 0) return series.map(() => ({ count: 0, val: 0 }));
    const raw    = vals.map(v => (v / total) * ROWS);
    const floors = raw.map(Math.floor);
    const remainder = ROWS - floors.reduce((a, b) => a + b, 0);
    const order  = raw
      .map((v, i) => ({ i, frac: v - floors[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < Math.min(remainder, order.length); k++) {
      floors[order[k].i]++;
    }
    return series.map((s, j) => ({ count: floors[j], val: s.values[mi] ?? 0 }));
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="w-full border border-white/10 bg-white/5 backdrop-blur-md rounded-xl p-6 md:p-8"
    >
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.4em] uppercase text-white/60">
          GENRE GRID
        </h2>
        <p className="text-[8px] text-white/20 tracking-[0.15em] uppercase mt-1">
          Monthly release proportion · past 12 months
        </p>
      </div>

      {/* Grid */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${gridW} ${vbH}`}
          width="100%"
          height="auto"
          style={{ display: 'block', maxHeight: 220 }}
        >
          {months.map((m, mi) => {
            const x    = mi * STEP;
            const data = monthData[mi];
            const total = data.reduce((a, d) => a + d.val, 0);
            const rects: React.ReactNode[] = [];
            let row = ROWS;

            series.forEach((_, j) => {
              const { count, val } = data[j];
              const t = total === 0 ? 0 : val / globalMax;

              if (count === 0 && total === 0) {
                // Empty month: faint placeholder squares
                for (let r = 0; r < ROWS; r++) {
                  rects.push(
                    <rect key={`ph-${j}-${r}`}
                      x={x} y={r * STEP} width={CELL} height={CELL}
                      fill="rgba(255,255,255,0.04)" rx={1} />
                  );
                }
                return;
              }

              for (let r = 0; r < count; r++) {
                row--;
                rects.push(
                  <rect key={`${j}-${r}`}
                    x={x} y={row * STEP} width={CELL} height={CELL}
                    fill={heat(t)} rx={1} />
                );
              }
            });

            const showLabel = mi % 2 === 0 || mi === n - 1;
            return (
              <g key={m}>
                {rects}
                {showLabel && (
                  <text
                    x={x + CELL / 2} y={gridH + 16}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.20)"
                    style={{ fontSize: 7, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.08em' }}
                  >
                    {MONTH_ABBR[parseInt(m.split('-')[1], 10) - 1]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Heat scale legend */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-[7px] text-white/20 font-black uppercase tracking-wider">LOW</span>
        <svg width={80} height={8}>
          <defs>
            <linearGradient id="heat-legend" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="rgba(10,20,160,0.6)" />
              <stop offset="35%"  stopColor="rgba(180,20,20,0.85)" />
              <stop offset="70%"  stopColor="rgba(218,140,0,0.9)" />
              <stop offset="100%" stopColor="rgba(255,220,180,1)" />
            </linearGradient>
          </defs>
          <rect x={0} y={1} width={80} height={6} fill="url(#heat-legend)" rx={2} />
        </svg>
        <span className="text-[7px] text-white/20 font-black uppercase tracking-wider">HIGH</span>
      </div>
    </motion.div>
  );
};
