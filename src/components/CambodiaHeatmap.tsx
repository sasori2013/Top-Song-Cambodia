'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PROVINCES_DATA from '../data/provinces.json';

const SVG_W = 1000;
const SVG_H = 834;
const DOT_STEP = 16;
const DOT_R = 4.5;

interface DotPoint {
  x: number;
  y: number;
  provinceId: string;
  views: number;
  phase: number; // 0–1, stable per-dot offset for continuous animation
}

function parseSvgD(d: string): [number, number][] {
  const pts: [number, number][] = [];
  const coords = d.match(/-?[\d.]+/g);
  if (coords) {
    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i + 1]) pts.push([+coords[i], +coords[i + 1]]);
    }
  }
  return pts;
}


export function CambodiaHeatmap({ data, stats: _stats, top3: _top3 }: { data?: any[]; stats?: any; top3?: any[] }) {
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [dotGrid, setDotGrid] = useState<DotPoint[]>([]);

  const processedProvinces = useMemo(() => {
    return PROVINCES_DATA.map((p) => {
      const pts = parseSvgD(p.path);
      let cx = 0, cy = 0;
      if (pts.length > 0) {
        pts.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= pts.length; cy /= pts.length;
      } else { cx = 500; cy = 400; }
      const d = data?.find(item => item.id === p.id);
      const rawScore = d ? d.value : p.defaultValue;
      // 人口ウェイト: 全国平均人口(688,886)を基準に補正
      const popWeight = (p as any).population ? (p as any).population / 688886 : 1;
      const views = Math.round(rawScore * popWeight);
      return { ...p, cx, cy, views, rawScore };
    });
  }, [data]);

  const ranking = useMemo(() => [...processedProvinces].sort((a, b) => b.views - a.views), [processedProvinces]);
  const currentProv = useMemo(() => ranking[highlightIdx] || ranking[0], [highlightIdx, ranking]);
  const totalViews = useMemo(() => processedProvinces.reduce((s, p) => s + p.views, 0), [processedProvinces]);

  const formatPct = (views: number) => {
    if (!totalViews) return '-';
    return (views / totalViews * 100).toFixed(1) + '%';
  };

  // Build dot grid via Canvas hit-testing (client-side only, runs once)
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = SVG_W;
    canvas.height = SVG_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dots: DotPoint[] = [];
    // Pre-build Path2D objects once
    const paths = processedProvinces.map(p => ({ province: p, path2d: new Path2D(p.path) }));

    for (let x = DOT_STEP / 2; x < SVG_W; x += DOT_STEP) {
      for (let y = DOT_STEP / 2; y < SVG_H; y += DOT_STEP) {
        for (const { province, path2d } of paths) {
          if (ctx.isPointInPath(path2d, x, y)) {
            dots.push({ x, y, provinceId: province.id, views: province.views, phase: ((x * 17 + y * 31) % 100) / 100 });
            break;
          }
        }
      }
    }
    setDotGrid(dots);
  }, [processedProvinces]);

  // Auto-advance highlight
  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightIdx((prev) => (prev + 1) % PROVINCES_DATA.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const maxViews = useMemo(() => Math.max(...processedProvinces.map(p => p.views || 0), 1), [processedProvinces]);

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 w-full font-['Outfit']">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/5">
        <div>
          <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] text-white/80 uppercase pl-[0.8em]">
            PROVINCIAL HEATMAP
          </h2>
          <p className="mt-2 text-[8px] md:text-[9px] font-medium tracking-[0.2em] text-white/45 uppercase pl-[1em]">
            Cambodia Music Heat by Region — Updated Daily
          </p>
        </div>
        <span className="text-[9px] font-mono font-bold text-white/45 uppercase tracking-widest">Live Region</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        {/* Map panel */}
        <div className="flex-[2] w-full bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden relative flex items-center justify-center p-6 min-h-[380px]">
          <div className="relative w-full h-full">
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full">
              {dotGrid.map((dot, i) => {
                const isActive = dot.provinceId === currentProv.id;
                const intensity = Math.sqrt(dot.views / maxViews);
                const inactiveOpacity = 0.20 + intensity * 0.3;
                const targetOpacity = isActive ? 0.85 : inactiveOpacity;
                return (
                  <motion.circle
                    key={i}
                    cx={dot.x}
                    cy={dot.y}
                    r={DOT_R}
                    fill="#ffffff"
                    animate={{ opacity: targetOpacity }}
                    transition={{ duration: 1.2, ease: 'easeInOut' }}
                    onClick={() => {
                      const idx = ranking.findIndex(r => r.id === dot.provinceId);
                      if (idx !== -1) setHighlightIdx(idx);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}

              {/* Active province label */}
              <text
                x={currentProv.cx}
                y={currentProv.cy - 16}
                textAnchor="middle"
                style={{ fontSize: '13px', fontWeight: 900, fill: '#ffffff', pointerEvents: 'none' }}
              >
                {formatPct(currentProv.views)}
              </text>
            </svg>
          </div>

          {/* REGION FOCUS overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-lg px-4 py-3 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 blur-[60px] rounded-full pointer-events-none" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <span className="text-[7px] font-bold text-white/55 uppercase tracking-[0.4em] block mb-1">REGION FOCUS</span>
                  <AnimatePresence mode="wait">
                    <motion.h3
                      key={currentProv.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.3 }}
                      className="text-lg font-black text-white tracking-tight leading-none"
                    >
                      {currentProv.name}
                    </motion.h3>
                  </AnimatePresence>
                </div>
                <div className="text-right">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentProv.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="text-2xl font-extralight tracking-tighter tabular-nums text-white"
                    >
                      {formatPct(currentProv.views)}
                    </motion.div>
                  </AnimatePresence>
                  <p className="text-[7px] font-black text-white/55 uppercase tracking-[0.2em]">HEAT VOLUME</p>
                </div>
                <div className="flex items-center gap-1.5 ml-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel: Donut chart + Ranking */}
        <div className="lg:w-52 w-full flex flex-col gap-4">

          {/* Donut Chart */}
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 flex flex-col items-center">
            {(() => {
              const CX = 80, CY = 80, OR = 68, IR = 44;
              let angle = -Math.PI / 2;
              return (
                <svg width="160" height="160" viewBox="0 0 160 160">
                  {ranking.map((p) => {
                    const pct = totalViews ? p.views / totalViews : 0;
                    if (pct < 0.001) return null;
                    const startAngle = angle;
                    const endAngle = angle + pct * 2 * Math.PI;
                    angle = endAngle;
                    const large = pct > 0.5 ? 1 : 0;
                    const ox1 = CX + OR * Math.cos(startAngle);
                    const oy1 = CY + OR * Math.sin(startAngle);
                    const ox2 = CX + OR * Math.cos(endAngle);
                    const oy2 = CY + OR * Math.sin(endAngle);
                    const ix1 = CX + IR * Math.cos(startAngle);
                    const iy1 = CY + IR * Math.sin(startAngle);
                    const ix2 = CX + IR * Math.cos(endAngle);
                    const iy2 = CY + IR * Math.sin(endAngle);
                    const d = `M ${ox1.toFixed(2)} ${oy1.toFixed(2)} A ${OR} ${OR} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L ${ix2.toFixed(2)} ${iy2.toFixed(2)} A ${IR} ${IR} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`;
                    const isActive = p.id === currentProv.id;
                    return (
                      <motion.path
                        key={p.id}
                        d={d}
                        animate={{ opacity: isActive ? 1 : 0.15, scale: isActive ? 1.04 : 1 }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                        fill="#ffffff"
                        stroke="#000"
                        strokeWidth="0.8"
                        style={{ transformOrigin: `${CX}px ${CY}px`, cursor: 'pointer' }}
                        onClick={() => setHighlightIdx(ranking.findIndex(r => r.id === p.id))}
                      />
                    );
                  })}
                  {/* Center text */}
                  <text x={CX} y={CY - 6} textAnchor="middle" style={{ fontSize: '18px', fontWeight: 900, fill: '#fff' }}>
                    {formatPct(currentProv.views)}
                  </text>
                  <text x={CX} y={CY + 10} textAnchor="middle" style={{ fontSize: '7px', fontWeight: 700, fill: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {currentProv.name}
                  </text>
                </svg>
              );
            })()}
          </div>

          {/* Ranking */}
          <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 flex flex-col flex-1">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-[9px] font-black text-white/60 uppercase tracking-[0.4em]">RANKING</h4>
              <span className="text-[7px] font-mono font-bold text-white/35 uppercase">Top 6</span>
            </div>
            <div className="space-y-1">
              {ranking.slice(0, 6).map((p, i) => (
                <motion.div
                  key={p.id}
                  onClick={() => setHighlightIdx(ranking.findIndex(r => r.id === p.id))}
                  animate={{ backgroundColor: p.id === currentProv.id ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  className="flex justify-between items-center px-2 py-2 rounded cursor-pointer border border-transparent hover:border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono font-bold w-4" style={{ color: p.id === currentProv.id ? '#ffffff' : 'rgba(255,255,255,0.45)' }}>
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <span className={`text-[12px] font-bold truncate ${p.id === currentProv.id ? 'text-white' : 'text-white/60'}`}>
                      {p.name}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
