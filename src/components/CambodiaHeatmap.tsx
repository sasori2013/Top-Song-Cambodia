'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PROVINCES_DATA from '../data/provinces.json';

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const SVG_W = 1000;
const SVG_H = 834;
const ACCENT_COLOR = '#AEEFFF'; // Matching HeatIndexMetrics

// ── HELPERS ──────────────────────────────────────────────────────────────────
function parseSvgD(d: string): [number, number][] {
  const pts: [number, number][] = [];
  const coords = d.match(/-?[\d.]+/g);
  if (coords) {
    for (let i = 0; i < coords.length; i += 2) {
      if (coords[i+1]) pts.push([+coords[i], +coords[i+1]]);
    }
  }
  return pts;
}

function formatNumber(num: number) {
  if (!num || num === 0) return '-';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.round(num).toLocaleString();
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export function CambodiaHeatmap({ data, stats: _stats, top3: _top3 }: { data?: any[]; stats?: any; top3?: any[] }) {
  const [highlightIdx, setHighlightIdx] = useState(0);

  const processedProvinces = useMemo(() => {
    return PROVINCES_DATA.map((p) => {
      const pts = parseSvgD(p.path);
      let cx = 0, cy = 0;
      if (pts.length > 0) {
        pts.forEach(([x, y]) => { cx += x; cy += y; });
        cx /= pts.length; 
        cy /= pts.length;
      } else {
        cx = 500; cy = 400;
      }
      const d = data?.find(item => item.id === p.id);
      return { ...p, cx, cy, views: d ? d.value : p.defaultValue };
    });
  }, [data]);

  const ranking = useMemo(() => {
    return [...processedProvinces].sort((a, b) => b.views - a.views);
  }, [processedProvinces]);

  const currentProv = useMemo(() => ranking[highlightIdx] || ranking[0], [highlightIdx, ranking]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHighlightIdx((prev) => (prev + 1) % PROVINCES_DATA.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative w-full max-w-7xl mx-auto px-4 py-12 font-['Outfit']">
      {/* Title / Header Section - Aligned with HeatIndexMetrics */}
      <div className="flex flex-col items-center mb-16 text-center text-white">
        <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.8em] uppercase pl-[0.8em] mb-4">
          PROVINCIAL HEATMAP
        </h2>
        <div className="w-12 h-px bg-white/10" />
      </div>

      <div className="flex flex-col lg:flex-row gap-10 items-stretch">
        {/* Left Column: Map */}
        <div className="flex-[2] w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden relative flex items-center justify-center p-12 group min-h-[500px] lg:h-[700px]">
          
          {/* Background Decor */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

          <div className="relative w-full h-full">
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-full drop-shadow-[0_0_50px_rgba(174,239,255,0.1)]">
              <defs>
                <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="activeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Province Paths */}
              {processedProvinces.map((p) => {
                const isActive = p.id === currentProv.id;
                return (
                  <motion.path
                    key={p.id}
                    d={p.path}
                    initial={false}
                    animate={{
                      fill: isActive ? ACCENT_COLOR : 'rgba(255,255,255,0.03)',
                      stroke: isActive ? ACCENT_COLOR : 'rgba(174,239,255,0.3)',
                      strokeWidth: isActive ? 2 : 0.8,
                      fillOpacity: isActive ? 0.2 : 0.4,
                    }}
                    transition={{ duration: 0.6 }}
                    onClick={() => {
                      const idx = ranking.findIndex(r => r.id === p.id);
                      if (idx !== -1) setHighlightIdx(idx);
                    }}
                    className="cursor-pointer"
                    style={{ 
                      filter: isActive ? 'url(#activeGlow)' : 'url(#lineGlow)',
                      strokeLinejoin: 'round',
                      strokeLinecap: 'round'
                    }}
                  />
                );
              })}

              {/* Map Labels */}
              {ranking.map((p) => {
                const isActive = p.id === currentProv.id;
                if (p.views === 0) return null;
                return (
                  <g key={`label-${p.id}`} className="pointer-events-none">
                    <motion.text
                      x={p.cx}
                      y={p.cy - 5}
                      textAnchor="middle"
                      animate={{
                        opacity: isActive ? 1 : 0.1,
                        scale: isActive ? 1.2 : 0.7,
                      }}
                      transition={{ duration: 0.6 }}
                      style={{ fontSize: isActive ? '24px' : '16px', fontWeight: 900, fill: '#fff' }}
                    >
                      {formatNumber(p.views)}
                    </motion.text>
                    <motion.text
                      x={p.cx}
                      y={p.cy + 12}
                      textAnchor="middle"
                      animate={{ opacity: isActive ? 0.6 : 0 }}
                      transition={{ duration: 0.6 }}
                      style={{ fontSize: '8px', fontWeight: 700, fill: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    >
                      {p.name}
                    </motion.text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom Legend */}
          <div className="absolute bottom-8 left-10 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT_COLOR }} />
              <span className="text-[8px] uppercase tracking-[0.3em] font-black text-white/40">Focused</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
              <span className="text-[8px] uppercase tracking-[0.3em] font-black text-white/20">Inactive</span>
            </div>
          </div>
        </div>

        {/* Right Column: Info & Ranking */}
        <div className="flex-1 w-full flex flex-col gap-6 lg:max-w-md">
          
          {/* Detailed Info Card - Aligned with HeatIndexMetrics typography */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-8 relative overflow-hidden flex flex-col justify-between">
            <div className="relative z-10">
              <header className="mb-8">
                <span className="text-[10px] md:text-[11px] font-bold text-white/40 uppercase tracking-[0.5em] block mb-2">
                  REGION FOCUS
                </span>
                <h3 className="text-4xl font-black text-white tracking-tighter leading-none">{currentProv.name}</h3>
              </header>
              
              <div className="flex flex-col items-start text-white">
                <div className="text-6xl md:text-8xl font-extralight tracking-tighter leading-none tabular-nums">
                  <span className="text-3xl md:text-4xl text-white/20 mr-1">#</span>
                  {formatNumber(currentProv.views)}
                </div>
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mt-6">
                   CUMULATIVE HEAT VOLUME
                </p>
              </div>
            </div>
            
            {/* Pulse Dot Accent */}
            <div className="mt-8 flex items-center gap-2 border-t border-white/5 pt-6">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: ACCENT_COLOR }} />
              <span className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Pulse-check active</span>
            </div>

            {/* Background Glow */}
            <div className="absolute -top-12 -right-12 w-48 h-48 blur-[80px] rounded-full" style={{ backgroundColor: `${ACCENT_COLOR}15` }} />
          </div>

          {/* Ranking List */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-8 flex-1 overflow-hidden">
            <div className="flex justify-between items-center mb-8">
              <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">RANKING</h4>
              <span className="text-[8px] font-mono font-bold text-white/10 uppercase">Top 100</span>
            </div>
            
            <div className="space-y-1.5 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
              {ranking.slice(0, 15).map((p, i) => (
                <motion.div
                  key={p.id}
                  onClick={() => setHighlightIdx(ranking.findIndex(r => r.id === p.id))}
                  whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.02)' }}
                  animate={{
                    backgroundColor: p.id === currentProv.id ? 'rgba(174,239,255,0.08)' : 'transparent',
                    borderColor: p.id === currentProv.id ? 'rgba(174,239,255,0.2)' : 'transparent',
                  }}
                  className="flex justify-between items-center p-3 rounded-lg border border-transparent cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-[9px] font-mono font-bold text-white/10" style={{ color: p.id === currentProv.id ? ACCENT_COLOR : undefined }}>
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <span className={`text-[13px] font-bold transition-colors ${p.id === currentProv.id ? 'text-white' : 'text-white/40'}`}>
                      {p.name}
                    </span>
                  </div>
                  <span className="text-[12px] font-black tabular-nums transition-colors" style={{ color: p.id === currentProv.id ? ACCENT_COLOR : 'rgba(255,255,255,0.15)' }}>
                    {formatNumber(p.views)}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${ACCENT_COLOR}30;
        }
      `}</style>
    </section>
  );
}
