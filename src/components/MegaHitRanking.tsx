'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface MegaHitItem {
  rank: number;
  videoId: string;
  artist: string;
  title: string;
  views: number;
  genre: string;
  publishedAt: string;
  thumbnail: string;
}

interface MegaHitResponse {
  total: number;
  page: number;
  pageSize: number;
  tier: string;
  items: MegaHitItem[];
}

const TIERS = [
  { key: 'all',  label: 'ALL',   color: 'text-white border-white/30',           active: 'bg-white text-black' },
  { key: '100m', label: '1億+',  color: 'text-orange-400 border-orange-400/40', active: 'bg-orange-400 text-black' },
  { key: '50m',  label: '5千万+', color: 'text-cyan-400 border-cyan-400/40',    active: 'bg-cyan-400 text-black' },
  { key: '20m',  label: '2千万+', color: 'text-violet-400 border-violet-400/40',active: 'bg-violet-400 text-black' },
  { key: '10m',  label: '1千万+', color: 'text-yellow-400 border-yellow-400/40',active: 'bg-yellow-400 text-black' },
  { key: '5m',   label: '500万+', color: 'text-pink-400 border-pink-400/40',    active: 'bg-pink-400 text-black' },
] as const;

const TIER_BADGES: Record<string, { label: string; cls: string }> = {
  LEGENDARY: { label: 'LEGENDARY', cls: 'bg-orange-500/20 text-orange-400 border border-orange-400/30' },
  DIAMOND:   { label: 'DIAMOND',   cls: 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30' },
  PLATINUM:  { label: 'PLATINUM',  cls: 'bg-violet-500/20 text-violet-300 border border-violet-400/30' },
  GOLD:      { label: 'GOLD',      cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30' },
  MEGAHIT:   { label: 'MEGA HIT',  cls: 'bg-pink-500/20 text-pink-400 border border-pink-400/30' },
};

function getTierBadge(views: number) {
  if (views >= 100_000_000) return TIER_BADGES.LEGENDARY;
  if (views >= 50_000_000)  return TIER_BADGES.DIAMOND;
  if (views >= 20_000_000)  return TIER_BADGES.PLATINUM;
  if (views >= 10_000_000)  return TIER_BADGES.GOLD;
  return TIER_BADGES.MEGAHIT;
}

function formatViews(v: number): string {
  if (v >= 100_000_000) return (v / 1_000_000).toFixed(0) + 'M';
  if (v >= 10_000_000)  return (v / 1_000_000).toFixed(1) + 'M';
  return (v / 1_000_000).toFixed(2) + 'M';
}

export const MegaHitRanking: React.FC = () => {
  const [tier, setTier]       = useState<string>('all');
  const [page, setPage]       = useState(1);
  const [data, setData]       = useState<MegaHitResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (t: string, p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mega-hits?tier=${t}&page=${p}&size=50`);
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(tier, page);
  }, [tier, page, fetchData]);

  const handleTier = (key: string) => {
    setTier(key);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 md:p-8 w-full">
      {/* Header */}
      <div className="flex flex-col gap-2 mb-8 pb-4 border-b border-white/5">
        <h2 className="text-[20px] md:text-[24px] font-black tracking-[0.8em] text-white uppercase pl-[0.8em]">
          MEGA HITS
        </h2>
        <p className="text-[9px] md:text-[10px] font-medium tracking-[0.15em] text-white/40 pl-[1em]">
          All-time Cambodian music — 5M+ views
        </p>
      </div>

      {/* Tier Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => handleTier(t.key)}
            className={`text-[10px] font-bold tracking-widest px-3 py-1.5 rounded border transition-all duration-200 ${
              tier === t.key ? t.active : `${t.color} bg-transparent hover:bg-white/5`
            }`}
          >
            {t.label}
          </button>
        ))}
        {data && (
          <span className="ml-auto text-[10px] text-white/30 self-center font-mono">
            {data.total.toLocaleString()} 曲
          </span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {data?.items.map((item) => {
            const badge = getTierBadge(item.views);
            const year  = item.publishedAt ? item.publishedAt.slice(0, 4) : '';
            return (
              <a
                key={item.videoId}
                href={`https://www.youtube.com/watch?v=${item.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-12 gap-2 md:gap-3 px-3 py-3 rounded-lg border border-white/5 hover:border-white/15 hover:bg-white/5 transition-all duration-200 items-center group"
              >
                {/* Rank */}
                <div className="col-span-1 text-right">
                  <span className="font-mono font-bold text-lg md:text-xl text-white/40 italic">
                    {item.rank}
                  </span>
                </div>

                {/* Thumbnail */}
                <div className="col-span-2 md:col-span-1">
                  <div className="relative h-10 w-16 bg-black border border-white/10 rounded overflow-hidden">
                    <img
                      src={item.thumbnail}
                      alt={item.artist}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                </div>

                {/* Artist / Title */}
                <div className="col-span-6 md:col-span-7 min-w-0">
                  <p className="text-[11px] font-bold text-white/60 truncate">{item.artist}</p>
                  <p className="text-[12px] md:text-[13px] font-semibold text-white truncate">{item.title}</p>
                </div>

                {/* Views + Tier + Year */}
                <div className="col-span-3 flex flex-col items-end gap-1">
                  <span className="font-mono font-bold text-[13px] md:text-[14px] text-white">
                    {formatViews(item.views)}
                  </span>
                  <span className={`text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {year && (
                    <span className="text-[9px] text-white/30 font-mono">{year}</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 pt-4 border-t border-white/5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-[10px] font-bold tracking-widest px-4 py-2 rounded border border-white/20 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ← PREV
          </button>
          <span className="font-mono text-[11px] text-white/40">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-[10px] font-bold tracking-widest px-4 py-2 rounded border border-white/20 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
};
