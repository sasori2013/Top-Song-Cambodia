'use client';

import { useState } from 'react';

const CYAN  = '#00E5FF';
const AMBER = '#F59E0B';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Song = {
  heat_id: string;
  title: string | null;
  youtube_video_id: string | null;
  apple_music_id: string | null;
  spotify_id: string | null;
  isrc: string | null;
  artwork_url: string | null;
  genres: string | null;
  views: number | null;
  rank: number | null;
  heatScore: number | null;
};

export type Release = {
  release_id: string;
  album_name: string;
  release_type: string;
  track_count: number;
  first_release_date: string | null;
  apple_music_url: string | null;
};

export type Analytics = {
  totalSongs: number;
  megaHits: number;
  megaHitRate: number;
  avgViews: number;
  avgHeat: number;
  chartRate: number;
  chartSongs: number;
  youtubeCount: number;
  appleCount: number;
  spotifyCount: number;
  facebookLinked: boolean;
  tiktokLinked: boolean;
  ytTotalViews: number;
  fbEngagement: number;
  top3Count: number;
  top10Count: number;
  viewBuckets: { label: string; count: number }[];
  // ── new ──
  cambodiaRank: number | null;
  totalArtists: number;
  avgPeakRank: number | null;
  fbReactionRate: number | null;
  releaseCount: number;
};

interface Props {
  songs: Song[];
  releases: Release[];
  analytics: Analytics;
  maxViews: number;
  maxHeat: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtViews(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

function rankColor(rank: number | null): string {
  if (rank == null) return 'rgba(255,255,255,0.15)';
  if (rank === 1)   return '#FFD700';
  if (rank <= 3)    return CYAN;
  if (rank <= 10)   return 'rgba(0,229,255,0.6)';
  return 'rgba(255,255,255,0.45)';
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function ArtistTabs({ songs, releases, analytics, maxViews, maxHeat }: Props) {
  const [tab, setTab] = useState<'albums' | 'songs' | 'analytics'>('albums');

  return (
    <div>
      {/* Tab nav */}
      <div className="flex items-center mb-6 border-b border-white/[0.06]">
        {(['albums', 'songs', 'analytics'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="relative px-6 py-3 text-xs font-black tracking-[0.3em] transition-colors uppercase"
            style={{ color: tab === key ? 'white' : 'rgba(255,255,255,0.3)' }}
          >
            {key}
            {tab === key && (
              <span className="absolute bottom-0 left-0 right-0 h-[1px]" style={{ background: CYAN }} />
            )}
          </button>
        ))}
      </div>

      {/* ── ALBUMS ──────────────────────────────────────────────────────────── */}
      {tab === 'albums' && (
        <div>
          {releases.length === 0 ? (
            <div className="border border-white/[0.06] px-6 py-16 text-center text-white/25 text-sm">
              No releases registered yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {releases.map(rel => <ReleaseCard key={rel.release_id} rel={rel} />)}
            </div>
          )}
        </div>
      )}

      {/* ── SONGS ───────────────────────────────────────────────────────────── */}
      {tab === 'songs' && (
        <div>
          <SectionHeader label="Discography" count={songs.length} sub="sorted by views" />
          <div
            className="hidden md:grid gap-3 px-3 py-2 mb-px text-[10px] font-black tracking-[0.2em] text-white/30 uppercase border border-white/[0.06] bg-white/[0.02]"
            style={{ gridTemplateColumns: '40px 1fr 130px 90px 64px' }}
          >
            <span /><span>Title</span><span>Views</span><span>Heat</span><span>Play</span>
          </div>
          {songs.length === 0 ? (
            <div className="border border-white/[0.06] px-6 py-12 text-center text-white/25 text-sm">
              No songs indexed yet.
            </div>
          ) : (
            <div className="border border-white/[0.06] divide-y divide-white/[0.04]">
              {songs.map((song, i) => (
                <SongRow key={song.heat_id} song={song} index={i} maxViews={maxViews} maxHeat={maxHeat} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ANALYTICS ───────────────────────────────────────────────────────── */}
      {tab === 'analytics' && <AnalyticsTab analytics={analytics} />}
    </div>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────

function AnalyticsTab({ analytics }: { analytics: Analytics }) {
  const topPct = analytics.cambodiaRank && analytics.totalArtists > 0
    ? Math.max(1, Math.ceil((analytics.cambodiaRank / analytics.totalArtists) * 100))
    : null;

  return (
    <div className="space-y-8">

      {/* ① Market Position ─────────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Market Position" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06] mb-px">
          <MetricCard
            label="Cambodia Rank"
            sub="by YouTube views"
            value={analytics.cambodiaRank != null ? `#${analytics.cambodiaRank}` : '—'}
            note={analytics.totalArtists > 0 ? `of ${analytics.totalArtists} artists` : undefined}
            accent={analytics.cambodiaRank != null && analytics.cambodiaRank <= 10}
          />
          <MetricCard
            label="Top Percentile"
            sub="relative position"
            value={topPct != null ? `Top ${topPct}%` : '—'}
            note={analytics.cambodiaRank != null ? `Rank #${analytics.cambodiaRank}` : undefined}
            accent={topPct != null && topPct <= 10}
          />
          <PlannedMetricCard label="Genre Rank" sub="position within genre" />
          <PlannedMetricCard label="Emerging Index" sub="year-over-year growth" />
        </div>
      </div>

      {/* ② Performance Metrics ────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Performance Metrics" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06]">
          <MetricCard
            label="Mega Hits"
            sub="> 3M views"
            value={analytics.megaHits.toString()}
            note={`${(analytics.megaHitRate * 100).toFixed(0)}% of songs`}
            accent={analytics.megaHits > 0}
          />
          <MetricCard
            label="Avg Views"
            sub="per song"
            value={fmtViews(analytics.avgViews)}
            note={`across ${analytics.totalSongs} songs`}
          />
          <MetricCard
            label="Avg Heat Score"
            sub="charted songs"
            value={analytics.avgHeat.toLocaleString()}
            accent={analytics.avgHeat > 0}
          />
          <MetricCard
            label="Chart Rate"
            sub="songs that charted"
            value={`${(analytics.chartRate * 100).toFixed(0)}%`}
            note={`${analytics.chartSongs} / ${analytics.totalSongs}`}
            accent={analytics.chartRate > 0.3}
          />
        </div>
      </div>

      {/* ③ Platform Consumption ───────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Platform Consumption" />
        <div className="grid grid-cols-1 md:grid-cols-2 border border-white/[0.06] bg-white/[0.01] divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
          <PieChart
            title="Music Platforms"
            slices={[
              { label: 'YouTube',     value: analytics.ytTotalViews, color: '#FF4444', sub: fmtViews(analytics.ytTotalViews) },
              { label: 'Spotify',     value: 0, na: true,            color: '#1DB954', sub: 'coming soon' },
              { label: 'Apple Music', value: 0, na: true,            color: '#FC3C44', sub: 'coming soon' },
            ]}
          />
          <PieChart
            title="Community Platforms"
            slices={[
              { label: 'Facebook', value: analytics.fbEngagement, color: '#1877F2',
                sub: analytics.fbEngagement > 0 ? analytics.fbEngagement.toLocaleString() : 'coming soon' },
              { label: 'TikTok',   value: 0, na: true, color: '#69C9D0', sub: 'coming soon' },
            ]}
          />
        </div>
      </div>

      {/* ④ Trend & Momentum ── PLANNED ────────────────────────────────────── */}
      <div>
        <SectionHeaderPlanned label="Trend & Momentum" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] border border-amber-500/20 mb-px">
          <PlannedMetricCard label="30-Day View Growth" sub="vs. prior month" />
          <PlannedMetricCard label="Chart Trajectory"   sub="rising · stable · declining" />
          <PlannedMetricCard label="Release Cadence"    sub="avg. months between releases" />
          <PlannedMetricCard label="Peak Season"        sub="best performing month" />
        </div>
        <div className="border border-amber-500/15 bg-amber-500/[0.02] px-5 py-3">
          <p className="text-[10px] text-white/25 leading-relaxed">
            Requires 30+ days of continuous snapshot history for growth comparison.
          </p>
        </div>
      </div>

      {/* ⑤ Audience Engagement ───────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Audience Engagement" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] border border-white/[0.06]">
          <MetricCard
            label="FB Reaction Rate"
            sub="reactions / views"
            value={analytics.fbReactionRate != null
              ? `${(analytics.fbReactionRate * 100).toFixed(1)}%`
              : '—'}
            note={analytics.fbEngagement > 0 ? 'community posts' : 'no FB data yet'}
            accent={analytics.fbReactionRate != null && analytics.fbReactionRate > 0.05}
          />
          <MetricCard
            label="Community Score"
            sub="FB views + reactions"
            value={analytics.fbEngagement > 0 ? fmtViews(analytics.fbEngagement) : '—'}
            accent={analytics.fbEngagement > 0}
          />
          <PlannedMetricCard label="Audience Loyalty"   sub="cross-song retention rate" />
          <PlannedMetricCard label="Comment Sentiment"  sub="positive / negative ratio" />
        </div>
      </div>

      {/* ⑥ Release Intelligence ──────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Release Intelligence" />
        <div className="grid grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] mb-px">
          <MetricCard
            label="Total Releases"
            sub="albums & EPs"
            value={analytics.releaseCount > 0 ? analytics.releaseCount.toString() : '—'}
            note="on Apple Music"
          />
          <MetricCard
            label="Avg Peak Rank"
            sub="per charted song"
            value={analytics.avgPeakRank != null ? `#${analytics.avgPeakRank.toFixed(1)}` : '—'}
            note={analytics.chartSongs > 0 ? `${analytics.chartSongs} charted songs` : undefined}
            accent={analytics.avgPeakRank != null && analytics.avgPeakRank <= 5}
          />
          <MetricCard
            label="Chart Rate"
            sub="songs ever charted"
            value={`${(analytics.chartRate * 100).toFixed(0)}%`}
            accent={analytics.chartRate > 0.3}
          />
        </div>
        <div className="grid grid-cols-3 gap-px bg-white/[0.06] border border-amber-500/20">
          <PlannedMetricCard label="Time to Peak"        sub="days from release to #1" />
          <PlannedMetricCard label="Chart Longevity"     sub="avg. weeks on chart" />
          <PlannedMetricCard label="Optimal Window"      sub="best day & season to release" />
        </div>
      </div>

      {/* ⑦ View Distribution ─────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="View Distribution" />
        <div className="border border-white/[0.06] divide-y divide-white/[0.04] bg-white/[0.01]">
          {analytics.viewBuckets.map(({ label, count }) => {
            const maxCount = Math.max(...analytics.viewBuckets.map(b => b.count), 1);
            const pct      = (count / maxCount) * 100;
            return (
              <div key={label} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-xs font-mono text-white/35 w-16 flex-shrink-0">{label}</span>
                <div className="flex-1 h-[2px] bg-white/[0.06] relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: CYAN, opacity: 0.45 }} />
                </div>
                <span className="text-xs font-mono text-white/35 w-16 text-right tabular-nums">{count} songs</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ⑧ Chart Performance ─────────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Chart Performance" />
        <div className="grid grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06]">
          <MetricCard label="Top 3"        sub="peak rank" value={analytics.top3Count.toString()}   note="songs" accent={analytics.top3Count > 0} />
          <MetricCard label="Top 10"       sub="peak rank" value={analytics.top10Count.toString()}  note="songs" accent={analytics.top10Count > 0} />
          <MetricCard label="Total Charted" sub="all entries" value={analytics.chartSongs.toString()} note="songs" accent={analytics.chartSongs > 0} />
        </div>
      </div>

      {/* ⑨ Brand Value Index ── PLANNED (premium) ─────────────────────────── */}
      <div>
        <SectionHeaderPlanned label="Brand Value Index" />
        <div className="border border-amber-500/20" style={{ background: 'rgba(245,158,11,0.02)' }}>

          {/* Score + sub-metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-amber-500/10">

            {/* Circular score */}
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div
                className="w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1"
                style={{ border: `2px solid rgba(245,158,11,0.18)`, background: 'rgba(245,158,11,0.04)' }}
              >
                <span className="text-5xl font-extralight tabular-nums" style={{ color: 'rgba(255,255,255,0.12)' }}>—</span>
                <span className="text-[9px] font-black tracking-[0.25em] uppercase" style={{ color: `${AMBER}55` }}>score</span>
              </div>
              <p className="text-[10px] font-black tracking-[0.2em] uppercase" style={{ color: `${AMBER}70` }}>
                Brand Affinity Score
              </p>
            </div>

            {/* Sub-metrics */}
            <div className="divide-y divide-amber-500/10">
              {[
                { label: 'Estimated Monthly Reach',  sub: 'unique audience size'          },
                { label: 'Campaign Value Estimate',  sub: 'brand partnership value (USD)'  },
                { label: 'Audience Quality Index',   sub: 'engagement authenticity score'  },
                { label: 'Collaboration Impact',     sub: 'co-release view uplift factor'  },
              ].map(({ label, sub }) => (
                <div key={label} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.15em] text-white/25 uppercase">{label}</p>
                    <p className="text-[10px] text-white/15 mt-0.5">{sub}</p>
                  </div>
                  <span className="text-xl font-extralight tabular-nums text-white/12">—</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Coverage roadmap */}
          <div className="border-t border-amber-500/10 px-6 py-5">
            <p className="text-[10px] font-black tracking-[0.3em] text-white/30 uppercase mb-4">
              Data Coverage
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2.5 gap-x-4">
              {([
                { label: 'YouTube Views',    status: 'live'    },
                { label: 'FB Engagement',    status: 'live'    },
                { label: 'Spotify Streams',  status: 'partial' },
                { label: 'Apple Music',      status: 'partial' },
                { label: 'TikTok Views',     status: 'planned' },
                { label: 'Demographics',     status: 'planned' },
                { label: 'Ticket Sales',     status: 'planned' },
                { label: 'Collabs History',  status: 'planned' },
              ] as { label: string; status: 'live' | 'partial' | 'planned' }[]).map(({ label, status }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span
                    className="text-xs flex-shrink-0"
                    style={{
                      color: status === 'live'    ? CYAN
                           : status === 'partial' ? 'rgba(255,255,255,0.45)'
                           : 'rgba(255,255,255,0.2)',
                    }}
                  >
                    {status === 'live' ? '✓' : status === 'partial' ? '◐' : '·'}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{
                      color: status === 'live'    ? 'rgba(255,255,255,0.55)'
                           : status === 'partial' ? 'rgba(255,255,255,0.35)'
                           : 'rgba(255,255,255,0.18)',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlannedBadge() {
  return (
    <span
      className="text-[9px] font-black tracking-[0.25em] uppercase px-2 py-0.5 flex-shrink-0"
      style={{ color: `${AMBER}99`, border: `1px solid ${AMBER}35`, background: `${AMBER}0A` }}
    >
      PLANNED
    </span>
  );
}

function PlannedMetricCard({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="flex flex-col px-5 py-5 gap-1 relative"
      style={{ background: `rgba(245,158,11,0.03)` }}
    >
      <div className="absolute top-2.5 right-2.5">
        <PlannedBadge />
      </div>
      <span className="text-[10px] font-black tracking-[0.2em] text-white/20 uppercase pr-14">{label}</span>
      <span className="text-[10px] tracking-wide text-white/12 uppercase mb-1">{sub}</span>
      <span className="text-3xl font-extralight" style={{ color: 'rgba(255,255,255,0.1)' }}>—</span>
    </div>
  );
}

function SectionHeader({ label, count, sub }: { label: string; count?: number; sub?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-xs font-black tracking-[0.35em] text-white/50 uppercase">{label}</p>
      {count != null && <span className="text-xs font-mono text-white/25">{count}</span>}
      <div className="h-px flex-1 bg-white/[0.06]" />
      {sub && <span className="text-[10px] tracking-[0.15em] text-white/25 uppercase">{sub}</span>}
    </div>
  );
}

function SectionHeaderPlanned({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-xs font-black tracking-[0.35em] text-white/50 uppercase">{label}</p>
      <PlannedBadge />
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

function MetricCard({
  label, sub, value, note, accent,
}: {
  label: string; sub: string; value: string; note?: string; accent?: boolean;
}) {
  return (
    <div className="flex flex-col px-5 py-5 bg-black gap-1">
      <span className="text-[10px] font-black tracking-[0.2em] text-white/30 uppercase">{label}</span>
      <span className="text-[10px] tracking-wide text-white/20 uppercase mb-2">{sub}</span>
      <span
        className="text-3xl font-extralight tabular-nums"
        style={{ color: accent ? CYAN : 'rgba(255,255,255,0.85)' }}
      >
        {value}
      </span>
      {note && <span className="text-xs font-mono text-white/30 mt-1">{note}</span>}
    </div>
  );
}

function PieChart({ title, slices }: {
  title: string;
  slices: { label: string; value: number; color: string; sub: string; na?: boolean }[];
}) {
  const size = 148;
  const cx   = size / 2;
  const cy   = size / 2;
  const R    = 60;
  const r    = 32;
  const GAP  = 0.05;

  const active = slices.filter(s => !s.na && s.value > 0);
  const total  = active.reduce((s, p) => s + p.value, 0);

  const sectors: { d: string; color: string }[] = [];
  let angle = -Math.PI / 2;

  for (const { value, color } of active) {
    const sweep = total > 0
      ? (value / total) * 2 * Math.PI
      : (2 * Math.PI / slices.length);
    const a1 = angle + GAP / 2;
    const a2 = angle + sweep - GAP / 2;
    if (a2 > a1) {
      const large = a2 - a1 > Math.PI ? 1 : 0;
      const d = [
        `M ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
        `L ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}`,
        `A ${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}`,
        `L ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`,
        `A ${r} ${r} 0 ${large} 0 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
        'Z',
      ].join(' ');
      sectors.push({ d, color });
    }
    angle += sweep;
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="text-[10px] font-black tracking-[0.3em] text-white/25 uppercase">{title}</p>
      <div className="flex items-center gap-6">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {sectors.length === 0 && (
            <path
              d={`M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z M ${cx} ${cy - r} A ${r} ${r} 0 1 0 ${cx - 0.01} ${cy - r} Z`}
              fill="rgba(255,255,255,0.05)"
              fillRule="evenodd"
            />
          )}
          {sectors.map(({ d, color }, i) => (
            <path key={i} d={d} fill={color} opacity={0.82} />
          ))}
        </svg>
        <div className="flex flex-col gap-3 flex-1">
          {slices.map(({ label, value, color, sub, na }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: (!na && value > 0) ? color : 'rgba(255,255,255,0.10)' }}
              />
              <span
                className="text-xs font-bold uppercase tracking-wide flex-1"
                style={{ color: na ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)' }}
              >
                {label}
              </span>
              <span className="text-[10px] font-mono" style={{ color: na ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)' }}>
                {sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReleaseCard({ rel }: { rel: Release }) {
  const isAlbum = rel.release_type === 'album';
  const year    = rel.first_release_date?.slice(0, 4) ?? '—';
  const card = (
    <div
      className="group relative border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all p-4 flex flex-col gap-3"
      style={isAlbum ? { borderTopColor: `${CYAN}50` } : {}}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-black tracking-[0.2em] uppercase px-2 py-0.5"
          style={
            isAlbum
              ? { color: CYAN, background: `${CYAN}15`, border: `1px solid ${CYAN}35` }
              : { color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }
          }
        >
          {isAlbum ? 'ALBUM' : 'EP'}
        </span>
        <span className="text-base font-light tabular-nums" style={{ color: isAlbum ? CYAN : 'rgba(255,255,255,0.35)' }}>
          {year}
        </span>
      </div>
      <p className="text-sm font-medium text-white/85 leading-snug group-hover:text-white transition-colors line-clamp-2">
        {rel.album_name}
      </p>
      <p className="text-xs font-mono text-white/35 mt-auto">{rel.track_count} tracks</p>
      {rel.apple_music_url && (
        <span className="absolute top-3 right-3 text-xs font-black text-white/20 group-hover:text-white/50 transition-colors">↗</span>
      )}
    </div>
  );
  return rel.apple_music_url ? (
    <a href={rel.apple_music_url} target="_blank" rel="noopener noreferrer">{card}</a>
  ) : (
    <div>{card}</div>
  );
}

function SongRow({ song, index, maxViews, maxHeat }: {
  song: Song; index: number; maxViews: number; maxHeat: number;
}) {
  const isRanked = song.rank != null;
  const isTop3   = isRanked && song.rank! <= 3;
  const isTop10  = isRanked && song.rank! <= 10;
  const color    = rankColor(song.rank);
  const viewsPct = song.views    != null ? (song.views    / maxViews) * 100 : 0;
  const heatPct  = song.heatScore != null ? (song.heatScore / maxHeat) * 100 : 0;

  return (
    <div
      className="group flex items-center gap-3 px-3 py-3 hover:bg-white/[0.03] transition-colors"
      style={isTop3 ? { borderLeft: `2px solid ${color}` } : { borderLeft: '2px solid transparent' }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 overflow-hidden bg-white/5"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {song.artwork_url ? (
          <img src={song.artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors">
          {song.title || '—'}
        </p>
        <p className="text-[10px] font-mono text-white/25 mt-0.5 tracking-wider">{song.heat_id}</p>
      </div>

      <div className="hidden md:block w-32 flex-shrink-0">
        {song.views != null ? (
          <>
            <div className="flex justify-end mb-1.5">
              <span className="text-xs font-mono text-white/50">{fmtViews(song.views)}</span>
            </div>
            <div className="h-px bg-white/8 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${viewsPct}%` }} />
            </div>
          </>
        ) : (
          <span className="text-xs font-mono text-white/20">—</span>
        )}
      </div>

      <div className="hidden md:block w-[88px] flex-shrink-0">
        {song.heatScore != null ? (
          <>
            <div className="flex justify-end mb-1.5">
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: isTop10 ? color : 'rgba(255,255,255,0.35)' }}
              >
                {Math.round(song.heatScore).toLocaleString()}
              </span>
            </div>
            <div className="h-px bg-white/8 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${heatPct}%`, background: isTop3 ? color : 'rgba(255,255,255,0.25)' }}
              />
            </div>
          </>
        ) : (
          <span className="text-xs font-mono text-white/20">—</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0 w-16 justify-end">
        {song.youtube_video_id && (
          <a
            href={`https://youtube.com/watch?v=${song.youtube_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-black tracking-wider uppercase px-2 py-1 border border-white/12 text-white/35 hover:text-white/80 hover:border-white/35 transition-colors"
          >
            YT
          </a>
        )}
        {song.apple_music_id && (
          <span className="text-[10px] font-black tracking-wider uppercase px-2 py-1 border border-white/8 text-white/20">AM</span>
        )}
        {song.spotify_id && (
          <span className="text-[10px] font-black tracking-wider uppercase px-2 py-1 border border-white/8 text-white/20">SP</span>
        )}
      </div>
    </div>
  );
}
