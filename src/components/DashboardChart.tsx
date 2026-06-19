'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RankingItem, RankingStats } from '@/lib/types';
import { TrendChart } from './TrendChart';
import { HeatScore } from './HeatScore';
import { cleanSongTitle } from '@/lib/utils';

interface DashboardChartProps {
  items: RankingItem[];
  stats?: RankingStats;
}

export const DashboardChart: React.FC<DashboardChartProps> = ({ items }) => {
  const [showAll, setShowAll] = useState(false);

  const sortedItems = [...items].sort((a, b) => a.rank - b.rank);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const top20Items = sortedItems.slice(0, 20);
  const displayedItems = showAll ? top20Items : top20Items.slice(0, 3);

  const toggleRow = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 md:p-8 w-full font-outfit">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/80">HEAT RANKING</h2>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[7px] text-white/45 font-bold uppercase tracking-widest font-mono">LIVE</span>
        </div>
      </div>

{/* Table Rows */}
      <div className="space-y-2">
        {displayedItems.map((item, index) => {
          const cleanedTitle = cleanSongTitle(item.title);
          const isExpanded = expandedId === item.videoId;
          const isNew = item.rankChange === 'NEW';
          const isUp = typeof item.rankChange === 'number' && item.rankChange > 0;
          const isDown = typeof item.rankChange === 'number' && item.rankChange < 0;

          return (
            <div
              key={item.videoId || `rank-${item.rank}-${index}`}
              className={`border rounded-lg transition-all duration-300 group ${
                isExpanded
                  ? 'border-white/20 bg-white/10'
                  : 'border-white/5 hover:border-white/15 hover:bg-white/5 bg-transparent'
              }`}
            >
              <div
                onClick={() => toggleRow(item.videoId)}
                className="grid grid-cols-12 gap-2 md:gap-4 px-4 py-6 items-center cursor-pointer select-none"
              >
                {/* Rank */}
                <div className="col-span-2 md:col-span-1 flex items-center gap-2">
                  <span className="font-mono font-bold text-3xl md:text-4xl text-white/95 italic">
                    {item.rank.toString().padStart(2, '0')}
                  </span>
                </div>

                {/* Track Info */}
                <div className="col-span-7 md:col-span-5 flex items-center gap-3">
                  <div className="relative h-14 w-24 bg-black border border-white/10 rounded overflow-hidden shrink-0">
                    <img src={item.thumbnail} alt={item.artist} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm md:text-base font-bold text-white truncate">{item.artist}</h4>
                    <p className="text-xs md:text-sm text-white/65 truncate">{cleanedTitle}</p>
                  </div>
                </div>

                {/* Trend Status */}
                <div className="col-span-3 md:col-span-2 flex flex-col justify-center items-center text-center gap-1">
                  {item.rankChange !== undefined ? (
                    <div className="text-[9px] font-black tracking-widest uppercase">
                      {isNew ? (
                        <span className="text-white animate-pulse-slow">★ NEW</span>
                      ) : isUp ? (
                        <span className="text-white/95">▲ +{item.rankChange}</span>
                      ) : isDown ? (
                        <span className="text-white/55">▼ {Math.abs(Number(item.rankChange))}</span>
                      ) : (
                        <span className="text-white/55">▶ STAY</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-white/20">-</span>
                  )}
                </div>

                {/* Score */}
                <div className="col-span-10 md:col-span-3 flex md:justify-end items-center justify-between mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                  <span className="md:hidden text-[8px] font-black text-white/20 uppercase tracking-wider">HEAT SCORE</span>
                  <HeatScore
                    rank={item.rank}
                    score={item.heatScore}
                    size="sm"
                    color="#ffffff"
                    textColor="#ffffff"
                    disableAnimation={true}
                    className="scale-[1.4] origin-right"
                  />
                </div>

                {/* Expand Indicator (Chevron) */}
                <div className="col-span-2 md:col-span-1 flex justify-end items-center mt-2 md:mt-0 pt-2 md:pt-0 border-t md:border-t-0 border-white/5">
                  <svg
                    className={`h-4 w-4 text-white/30 transition-all duration-300 group-hover:text-white/70 ${
                      isExpanded ? 'rotate-180 text-white/80' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expandable Details */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden border-t border-white/5"
                  >
                    <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      <div className="bg-white/5 rounded-lg p-4 border border-white/5 flex flex-col items-center">
                        <span className="text-[8px] font-black text-white/60 uppercase tracking-[0.2em] mb-4">
                          7-Day Growth Velocity Chart
                        </span>
                        <div className="w-full">
                          <TrendChart
                            data={item.history}
                            width={400}
                            height={90}
                            color="#ffffff"
                            heatScore={item.heatScore}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'Velocity', value: `+${item.growth}%` },
                            { label: 'Reaction', value: `${item.engagement}%` },
                            { label: '24h Est Views', value: formatNumber(Math.floor(item.dailyViews * 1.2)) },
                          ].map(({ label, value }) => (
                            <div key={label} className="bg-white/5 rounded p-3 border border-white/5">
                              <span className="text-[7px] md:text-[8px] text-white/60 font-bold uppercase tracking-widest block mb-1">{label}</span>
                              <span className="text-xs md:text-sm text-white font-mono font-bold">{value}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-white/60 border-t border-white/5 pt-4">
                          <span>Total Views: {formatNumber(item.views)}</span>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-white/60 hover:text-white hover:underline font-bold tracking-wider uppercase text-[9px] flex items-center gap-1"
                            >
                              Watch Video ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Toggle Button */}
      {top20Items.length > 3 && (
        <div className="mt-6 flex justify-center border-t border-white/5 pt-6">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-6 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold tracking-widest uppercase transition-all duration-300 flex items-center gap-2"
          >
            {showAll ? <>Show Top 3 Only <span className="text-[10px]">▲</span></> : <>Show Ranks 4–20 <span className="text-[10px]">▼</span></>}
          </button>
        </div>
      )}
    </div>
  );
};
