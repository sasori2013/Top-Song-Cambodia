'use client';

import React, { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { GenreTrendData } from '@/lib/types';

const CX1     = 185;
const CX2     = 545;
const CY      = 170;
const R       = 120;
const MIN_R   = R * 0.38;
const LR      = 148;
const VW      = 860;
const VH      = 340;
const HISTORY = 12;

const ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SHORT: Record<string, string> = {
  'Pop':               'POP',
  'Hip-hop & Rap':     'HIP-HOP',
  'R&B & Soul':        'R&B',
  'Ballad':            'BALLAD',
  'Traditional Khmer': 'TRAD',
  'Rock':              'ROCK',
  'Other':             'OTHER',
};

const STROKE_W  = [0.5,  0.5,  0.55, 0.55, 0.6,  0.6,  0.65, 0.65, 0.70, 0.75, 0.85, 1.5 ];
const GRAY_OP   = 0.45; // uniform past-month opacity (blob + legend line)
const GRAY_TEXT = 0.55; // uniform past-month legend text opacity

function ptAt(cx: number, a: number, r: number) {
  return { x: cx + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

// center = 50% of max; values below that threshold sit at MIN_R
function makeToR(props: number[]): (p: number) => number {
  const max = Math.max(...props, 0.001);
  return (p: number) => {
    const t = Math.max(0, (p / max - 0.5) / 0.5);
    return MIN_R + Math.pow(t, 1.4) * (R - MIN_R);
  };
}

function blobAt(cx: number, props: number[], angles: number[], toR: (p: number) => number): string {
  const pts = props.map((p, i) => ptAt(cx, angles[i], toR(p)));
  const n = pts.length;
  const alpha = 0.42;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n],     p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * alpha / 3;
    const cp1y = p1.y + (p2.y - p0.y) * alpha / 3;
    const cp2x = p2.x - (p3.x - p1.x) * alpha / 3;
    const cp2y = p2.y - (p3.y - p1.y) * alpha / 3;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d + ' Z';
}

interface Props {
  data?: GenreTrendData;
  viewsData?: GenreTrendData;
}

export const GenreStreamgraph: React.FC<Props> = ({ data, viewsData }) => {
  const uid = "genreradar";
  const [hoveredLayer, setHoveredLayer] = useState<number | null>(null);

  if (!data) return null;

  const { months } = data;
  const series1 = data.series.filter(s => s.genre !== 'Dance & EDM');
  const series2 = (viewsData?.series ?? data.series).filter(s => s.genre !== 'Dance & EDM');
  const n = months.length;
  const g = series1.length;
  const angles = series1.map((_, i) => (2 * Math.PI * i) / g - Math.PI / 2);

  let activeEnd = n - 1;
  while (activeEnd > 0 && series1.every(s => (s.values[activeEnd] ?? 0) === 0)) activeEnd--;

  const proportion = (series: typeof series1, mi: number): number[] => {
    const vals  = series.map(s => s.values[mi] ?? 0);
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    return vals.map(v => v / total);
  };

  const layerData = Array.from({ length: HISTORY }, (_, k) => {
    const mi = activeEnd - (HISTORY - 1 - k);
    if (mi < 0) return null;
    const [yr, mo] = months[mi].split('-');
    return {
      mi,
      props1: proportion(series1, mi),
      props2: proportion(series2, mi),
      label: `${ABBR[parseInt(mo, 10) - 1]} ${yr}`,
    };
  }).filter(Boolean) as { mi: number; props1: number[]; props2: number[]; label: string }[];

  const L = layerData.length;
  const offset = HISTORY - L;
  const activeLabel = layerData[L - 1]?.label ?? '';

  const hovIdx = hoveredLayer ?? L - 1;
  const displayProps1 = layerData[hovIdx]?.props1 ?? layerData[L - 1]?.props1 ?? [];
  const displayProps2 = layerData[hovIdx]?.props2 ?? layerData[L - 1]?.props2 ?? [];
  const displayLabel  = layerData[hovIdx]?.label ?? activeLabel;

  const normT = (props: number[], p: number) => {
    const max = Math.max(...props, 0.001);
    return Math.min(1, p / max);
  };

  // Render one radar's blob layers for a given center X
  const renderBlobs = (cx: number, propKey: 'props1' | 'props2', uidSuffix: string) =>
    layerData.map(({ [propKey]: props }, li) => {
      const idx      = li + offset;
      const isLatest = li === L - 1;
      const isHov    = hoveredLayer === li;
      const isDim    = hoveredLayer !== null && !isHov;
      const sw       = STROKE_W[idx] ?? 0.7;
      const isSelected = isHov || (hoveredLayer === null && isLatest);
      const finalOp  = isSelected ? 0.95 : isDim ? GRAY_OP * 0.45 : GRAY_OP;

      if (isLatest && hoveredLayer === null) {
        const toR = makeToR(props);
        return (
          <motion.g key={`${uidSuffix}-${li}`}
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.3 }}
          >
            <motion.path
              d={blobAt(cx, props, angles, toR)}
              fill="rgba(255,255,255,0.10)" stroke="none"
              filter={`url(#bloom-${uid})`}
              animate={{ opacity: [0.7, 1, 0.6, 0.95, 0.7] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <path d={blobAt(cx, props, angles, toR)} fill={`url(#fill-${uid})`} stroke="none" />
            <motion.path
              d={blobAt(cx, props, angles, toR)}
              fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={sw} strokeLinejoin="round"
              filter={`url(#glow-${uid})`}
              animate={{ scale: [1, 1.018, 0.990, 1.012, 1] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', times: [0,0.28,0.58,0.78,1] }}
              style={{ transformOrigin: `${cx}px ${CY}px` }}
            />
          </motion.g>
        );
      }
      return (
        <motion.path key={`${uidSuffix}-${li}`}
          d={blobAt(cx, props, angles, makeToR(props))}
          fill={isHov ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'}
          stroke="white" strokeOpacity={finalOp}
          strokeWidth={isHov ? sw + 0.5 : sw} strokeLinejoin="round"
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.7, delay: li * 0.08 }}
          style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.15s, fill 0.2s' }}
        />
      );
    });

  // Render genre labels for one radar
  const renderLabels = (cx: number, displayProps: number[]) =>
    series1.map((s, i) => {
      const prop   = displayProps[i] ?? 0;
      const p      = ptAt(cx, angles[i], LR);
      const a      = angles[i];
      const anchor = Math.cos(a) > 0.15 ? 'start' : Math.cos(a) < -0.15 ? 'end' : 'middle';
      const pct    = Math.round(prop * 100);
      const op     = 0.65 + normT(displayProps, prop) * 0.35;
      return (
        <g key={`${cx}-${s.genre}`}>
          <text x={p.x} y={p.y - 1} textAnchor={anchor}
            fill="white" fillOpacity={op} fontSize="8" fontWeight="700" letterSpacing="0.08em">
            {SHORT[s.genre] ?? s.genre.slice(0, 6).toUpperCase()}
          </text>
          <text x={p.x} y={p.y + 11} textAnchor={anchor}
            fill="white" fillOpacity={op * 0.80} fontSize="7.5" fontWeight="700" letterSpacing="0.04em">
            {pct}%
          </text>
        </g>
      );
    });

  const legendX      = VW - 145;
  const legendTop    = 20;
  const legendBottom = VH - 15;
  const legendSpacing = L > 1 ? (legendBottom - legendTop) / (L - 1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="w-full border border-white/10 bg-white/5 backdrop-blur-md rounded-xl p-6 md:p-8 font-outfit"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/80">GENRE RADAR</h2>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[7px] text-white/45 font-bold uppercase tracking-widest font-mono">{displayLabel}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto" style={{ fontFamily: 'monospace' }}>
        <defs>
          <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`bloom-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
          </filter>
          <radialGradient id={`fill-${uid}`} cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="white" stopOpacity="0.22" />
            <stop offset="60%"  stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="white" stopOpacity="0.02" />
          </radialGradient>
        </defs>

        {/* Divider between two radars */}
        <line
          x1={(CX1 + CX2) / 2} y1={20}
          x2={(CX1 + CX2) / 2} y2={VH - 20}
          stroke="white" strokeOpacity="0.15" strokeWidth="0.5"
        />

        {/* Left radar: RELEASES */}
        {renderBlobs(CX1, 'props1', 'r1')}
        {renderLabels(CX1, displayProps1)}
        <text x={CX1} y={CY + 5} textAnchor="middle"
          fill="rgba(255,255,255,0.35)" fontSize="6" fontWeight="700" letterSpacing="0.20em">
          RELEASES
        </text>

        {/* Right radar: VIEWS */}
        {renderBlobs(CX2, 'props2', 'r2')}
        {renderLabels(CX2, displayProps2)}
        <text x={CX2} y={CY + 5} textAnchor="middle"
          fill="rgba(255,255,255,0.35)" fontSize="6" fontWeight="700" letterSpacing="0.20em">
          VIEWS
        </text>

        {/* Shared legend — newest at top, fills right column */}
        <g transform={`translate(${legendX}, ${legendTop})`}>
          {Array.from({ length: L }, (_, di) => {
            const li       = L - 1 - di;
            const { label } = layerData[li];
            const isHov      = hoveredLayer === li;
            const isLatest   = li === L - 1;
            const isSelected = isHov || (hoveredLayer === null && isLatest);
            const lineOp     = isSelected ? 0.90 : GRAY_OP;
            const textOp     = isSelected ? 0.90 : GRAY_TEXT;
            const sw         = isSelected ? 1.6 : 0.6;
            const yPos       = di * legendSpacing;
            return (
              <g key={li}
                transform={`translate(0, ${yPos})`}
                onMouseEnter={() => setHoveredLayer(li)}
                onMouseLeave={() => setHoveredLayer(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={-4} y={-legendSpacing / 2} width={145} height={legendSpacing} fill="transparent" />
                <line x1={0} y1={0} x2={18} y2={0}
                  stroke="white" strokeOpacity={lineOp} strokeWidth={sw}
                  style={{ transition: 'stroke-opacity 0.15s, stroke-width 0.15s' }}
                />
                <text x={24} y={4}
                  fill="white" fillOpacity={textOp}
                  fontSize="11" fontWeight="700" letterSpacing="0.06em"
                  style={{ transition: 'fill-opacity 0.15s' }}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </motion.div>
  );
};
