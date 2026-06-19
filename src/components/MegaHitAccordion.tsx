'use client';

import React, { useState, useEffect } from 'react';

interface TopSong {
  videoId: string;
  artist: string;
  title: string;
  views: number;
  thumbnail: string;
}

interface YearSummary {
  year: number;
  count: number;
  topViews: number;
  topSong: TopSong;
}

interface SongItem {
  rank: number;
  videoId: string;
  artist: string;
  title: string;
  views: number;
  thumbnail: string;
}

function formatViews(v: number): string {
  if (v >= 100_000_000) return (v / 1_000_000).toFixed(0) + 'M';
  if (v >= 10_000_000)  return (v / 1_000_000).toFixed(1) + 'M';
  return (v / 1_000_000).toFixed(2) + 'M';
}

function getTierColor(v: number): string {
  if (v >= 100_000_000) return 'text-orange-400';
  if (v >= 50_000_000)  return 'text-cyan-400';
  if (v >= 20_000_000)  return 'text-violet-400';
  if (v >= 10_000_000)  return 'text-yellow-400';
  return 'text-pink-400';
}

function YearPanel({ year, onClose }: { year: number; onClose: () => void }) {
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSongs([]);
    // Fetch all songs for this year (max 200)
    fetch(`/api/mega-hits?year=${year}&size=200&page=1`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setSongs(d.items || []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const displayedSongs = showAll ? songs : songs.slice(0, 10);

  return (
    <div className="mt-2 space-y-0.5">
      {loading ? (
        <div className="space-y-1 py-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="max-h-[300px] overflow-y-auto pr-1 scrollbar-thin space-y-0.5">
            {displayedSongs.map(s => (
              <a
                key={s.videoId}
                href={`https://www.youtube.com/watch?v=${s.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/8 transition-colors group"
              >
                {/* Rank */}
                <span className="font-mono text-[10px] text-white/25 w-6 text-right shrink-0">
                  {s.rank}
                </span>
                {/* Thumb */}
                <div className="w-12 h-7 shrink-0 rounded overflow-hidden bg-black border border-white/10">
                  <img src={s.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200" loading="lazy" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-white/40 truncate leading-tight">{s.artist}</p>
                  <p className="text-[11px] text-white/80 font-medium truncate leading-tight">{s.title}</p>
                </div>
                {/* Views */}
                <span className={`font-mono font-bold text-[11px] shrink-0 ${getTierColor(s.views)}`}>
                  {formatViews(s.views)}
                </span>
              </a>
            ))}
          </div>

          {songs.length > 10 && (
            <div className="pt-2 pb-1 text-center border-t border-white/5 mt-2">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-[9px] font-bold tracking-widest text-white/40 hover:text-white/80 transition-colors uppercase py-1 px-4 border border-white/10 hover:border-white/25 rounded-md"
              >
                {showAll ? 'Show Top 10 Only' : `Show More (${songs.length - 10} songs)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const MegaHitAccordion: React.FC = () => {
  const [years, setYears]       = useState<YearSummary[]>([]);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/mega-hits?summary=true')
      .then(r => r.json())
      .then(d => {
        setYears(d.years || []);
        // Start completely collapsed by default
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (y: number) => setOpenYear(prev => prev === y ? null : y);

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 w-full font-outfit">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[10px] font-black tracking-[0.4em] uppercase text-white/80">MEGA HITS</h2>
        <a
          href="/mega-hits"
          className="flex items-center gap-2 text-white/45 hover:text-white/75 transition-colors"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
          <span className="text-[7px] font-bold uppercase tracking-widest font-mono">ALL TIME ↗</span>
        </a>
      </div>

      {/* Year Accordion */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {years.map(({ year, count, topViews, topSong }) => {
            const isOpen = openYear === year;
            return (
              <div key={year} className="rounded-lg overflow-hidden border border-white/5">
                {/* Year Header */}
                <button
                  onClick={() => toggle(year)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-200 ${
                    isOpen ? 'bg-white/10' : 'bg-transparent hover:bg-white/5'
                  }`}
                >
                  {/* Year */}
                  <span className="font-mono font-black text-[18px] text-white/80 w-12 text-left shrink-0">
                    {year}
                  </span>
                  {/* Top song thumb */}
                  <div className="w-10 h-6 shrink-0 rounded overflow-hidden bg-black border border-white/10">
                    <img src={topSong.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  {/* Top song name */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[10px] text-white/40 truncate leading-none">{topSong.artist}</p>
                    <p className="text-[11px] text-white/70 font-medium truncate leading-tight">{topSong.title}</p>
                  </div>
                  {/* Count + top views */}
                  <div className="shrink-0 text-right">
                    <p className={`font-mono font-bold text-[11px] ${getTierColor(topViews)}`}>
                      {formatViews(topViews)}
                    </p>
                    <p className="text-[9px] text-white/30 font-mono">{count}曲</p>
                  </div>
                  {/* Chevron */}
                  <span className={`text-white/30 text-[10px] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {/* Expanded songs */}
                {isOpen && (
                  <div className="px-2 pb-2 bg-white/5 border-t border-white/5">
                    <YearPanel year={year} onClose={() => setOpenYear(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
