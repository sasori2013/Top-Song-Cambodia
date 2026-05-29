import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AuraR3F } from '@/components/AuraR3F';
import { getBigQueryClient } from '@/lib/bigquery';
import { isArtistId } from '@/lib/heat-ids';

export const dynamic = 'force-dynamic';

const DS = 'heat_ranking';
const CYAN = '#00E5FF';

// ── Types ──────────────────────────────────────────────────────────────────────

type Artist = {
  heat_artist_id: string;
  name: string;
  name_khmer: string | null;
  youtube_channel_id: string | null;
  spotify_artist_id: string | null;
  apple_music_artist_id: string | null;
  bio: string | null;
  bio_khmer: string | null;
  country: string | null;
  is_cambodian: boolean | null;
  genres: string | null;
  profile_image_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
};

type Song = {
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

// ── Data fetching ──────────────────────────────────────────────────────────────

async function getArtistData(id: string): Promise<{ artist: Artist; songs: Song[] } | null> {
  const bq = getBigQueryClient();
  if (!bq) return null;

  try {
    const [[raw]] = await bq.query({
      query: `SELECT * FROM \`${DS}.heat_artists\` WHERE heat_artist_id = @id LIMIT 1`,
      params: { id },
    });
    if (!raw) return null;

    const artist: Artist = {
      heat_artist_id:       String(raw.heat_artist_id ?? ''),
      name:                 String(raw.name ?? ''),
      name_khmer:           raw.name_khmer ?? null,
      youtube_channel_id:   raw.youtube_channel_id ?? null,
      spotify_artist_id:    raw.spotify_artist_id ?? null,
      apple_music_artist_id: raw.apple_music_artist_id ?? null,
      bio:                  raw.bio ?? null,
      bio_khmer:            raw.bio_khmer ?? null,
      country:              raw.country ?? null,
      is_cambodian:         raw.is_cambodian ?? null,
      genres:               raw.genres ?? null,
      profile_image_url:    raw.profile_image_url ?? null,
      facebook_url:         raw.facebook_url ?? null,
      instagram_url:        raw.instagram_url ?? null,
      tiktok_url:           raw.tiktok_url ?? null,
      website_url:          raw.website_url ?? null,
    };

    const [rawSongs] = await bq.query({
      query: `
        WITH latest AS (
          SELECT
            MAX(s.date) AS snap_date,
            MAX(r.date) AS rank_date
          FROM \`${DS}.snapshots\` s
          CROSS JOIN (
            SELECT MAX(date) AS date
            FROM \`${DS}.rank_history\`
            WHERE type = 'DAILY'
          ) r
        )
        SELECT
          hs.heat_id,
          hs.canonical_title  AS title,
          hs.youtube_video_id,
          hs.apple_music_id,
          hs.spotify_id,
          hs.isrc,
          hs.artwork_url,
          hs.genres,
          CAST(snap.views AS INT64)  AS views,
          CAST(rh.rank   AS INT64)   AS rank,
          rh.heatScore
        FROM \`${DS}.heat_songs\` hs
        CROSS JOIN latest
        LEFT JOIN \`${DS}.snapshots\` snap
          ON hs.youtube_video_id = snap.videoId
         AND snap.date = latest.snap_date
        LEFT JOIN \`${DS}.rank_history\` rh
          ON hs.youtube_video_id = rh.videoId
         AND rh.date = latest.rank_date
         AND rh.type = 'DAILY'
        WHERE LOWER(hs.canonical_artist) = LOWER(@name)
        ORDER BY snap.views DESC NULLS LAST
        LIMIT 50
      `,
      params: { name: artist.name },
    });

    const songs: Song[] = rawSongs.map((r: any) => ({
      heat_id:          String(r.heat_id ?? ''),
      title:            r.title ?? null,
      youtube_video_id: r.youtube_video_id ?? null,
      apple_music_id:   r.apple_music_id ?? null,
      spotify_id:       r.spotify_id ?? null,
      isrc:             r.isrc ?? null,
      artwork_url:      r.artwork_url ?? null,
      genres:           r.genres ?? null,
      views:            r.views != null ? Number(r.views) : null,
      rank:             r.rank  != null ? Number(r.rank)  : null,
      heatScore:        r.heatScore != null ? Number(r.heatScore) : null,
    }));

    return { artist, songs };
  } catch (e: any) {
    console.error('[ArtistPage]', e.message);
    return null;
  }
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isArtistId(id)) return {};
  const data = await getArtistData(id);
  if (!data) return {};
  const { artist } = data;
  return {
    title: `${artist.name} | HEAT`,
    description: artist.bio ?? `${artist.name} — Cambodia Music Index`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtViews(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

function rankColor(rank: number | null): string {
  if (rank == null) return 'rgba(255,255,255,0.15)';
  if (rank === 1)   return '#FFD700';
  if (rank <= 3)    return CYAN;
  if (rank <= 10)   return 'rgba(0,229,255,0.6)';
  return 'rgba(255,255,255,0.45)';
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isArtistId(id)) notFound();

  const data = await getArtistData(id);
  if (!data) notFound();

  const { artist, songs } = data;

  const totalViews   = songs.reduce((sum, s) => sum + (s.views ?? 0), 0);
  const rankedSongs  = songs.filter(s => s.rank != null);
  const bestRank     = rankedSongs.length ? Math.min(...rankedSongs.map(s => s.rank!)) : null;
  const genreList    = artist.genres?.split(',').map(g => g.trim()).filter(Boolean) ?? [];
  const maxViews     = Math.max(...songs.map(s => s.views ?? 0), 1);
  const maxHeat      = Math.max(...songs.map(s => s.heatScore ?? 0), 1);
  const initial      = (artist.name || '?')[0].toUpperCase();

  const platformIds = [
    { label: 'HEAT Artist ID',    value: artist.heat_artist_id },
    { label: 'YouTube Channel',   value: artist.youtube_channel_id },
    { label: 'Spotify Artist',    value: artist.spotify_artist_id },
    { label: 'Apple Music Artist',value: artist.apple_music_artist_id },
  ];

  const socialLinks: { label: string; href: string }[] = [
    artist.youtube_channel_id ? { label: 'YouTube',   href: `https://youtube.com/channel/${artist.youtube_channel_id}` } : null,
    artist.facebook_url       ? { label: 'Facebook',  href: artist.facebook_url  } : null,
    artist.instagram_url      ? { label: 'Instagram', href: artist.instagram_url } : null,
    artist.tiktok_url         ? { label: 'TikTok',    href: artist.tiktok_url    } : null,
    artist.website_url        ? { label: 'Website',   href: artist.website_url   } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <main className="relative bg-black min-h-screen">
      <AuraR3F color="rgba(0, 229, 255, 0.04)" fullscreen progress={0} hideCluster />
      <Header />

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-28 pb-6 px-6 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">

          {/* Top strip: system label */}
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[9px] font-black tracking-[0.4em] text-white/20 uppercase">Artist Profile</span>
            <div className="h-px flex-1 bg-white/[0.06]" />
          </div>

          <div className="flex items-start gap-8">
            {/* Avatar */}
            <div className="flex-shrink-0 relative">
              {artist.profile_image_url ? (
                <img
                  src={artist.profile_image_url}
                  alt={artist.name}
                  className="w-24 h-24 rounded-full object-cover"
                  style={{ border: `1px solid ${CYAN}30` }}
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center"
                  style={{
                    background: 'radial-gradient(circle at 40% 40%, rgba(0,229,255,0.1), rgba(0,0,0,0.9))',
                    border: `1px solid ${CYAN}30`,
                  }}
                >
                  <span className="text-4xl font-extralight text-white/60 select-none">{initial}</span>
                </div>
              )}
              {/* online dot */}
              <span
                className="absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-black"
                style={{ background: CYAN }}
              />
            </div>

            {/* Name block */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {artist.is_cambodian !== false && (
                  <span
                    className="text-[8px] font-black tracking-[0.3em] uppercase px-2 py-0.5"
                    style={{ color: CYAN, border: `1px solid ${CYAN}40`, background: `${CYAN}0f` }}
                  >
                    Cambodian
                  </span>
                )}
                {artist.country && artist.country !== 'KH' && (
                  <span className="text-[8px] font-black tracking-[0.3em] uppercase px-2 py-0.5 border border-white/15 text-white/40">
                    {artist.country}
                  </span>
                )}
                {genreList.map(g => (
                  <span key={g} className="text-[8px] tracking-[0.2em] uppercase text-white/30 border border-white/8 px-2 py-0.5">
                    {g}
                  </span>
                ))}
              </div>

              <h1 className="text-3xl md:text-5xl font-extralight tracking-tighter text-white leading-none mb-1">
                {artist.name}
              </h1>
              {artist.name_khmer && (
                <p className="text-base font-light text-white/30 tracking-wider">{artist.name_khmer}</p>
              )}
            </div>

            {/* Key stats — top-right */}
            <div className="hidden md:grid grid-cols-4 gap-px bg-white/[0.06] flex-shrink-0 border border-white/[0.06]">
              <KpiCell label="Songs" value={songs.length.toString()} />
              <KpiCell label="Chart Entries" value={rankedSongs.length.toString()} />
              <KpiCell label="Best Rank" value={bestRank != null ? `#${bestRank}` : '—'} accent={bestRank != null && bestRank <= 3} />
              <KpiCell label="Total Views" value={fmtViews(totalViews)} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Dashboard Body ──────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-6">

        {/* ── Left Sidebar ── */}
        <aside className="md:w-64 flex-shrink-0 space-y-4">

          {/* Mobile KPIs */}
          <div className="md:hidden grid grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06]">
            <KpiCell label="Songs"        value={songs.length.toString()} />
            <KpiCell label="Chart"        value={rankedSongs.length.toString()} />
            <KpiCell label="Best Rank"    value={bestRank != null ? `#${bestRank}` : '—'} accent={bestRank != null && bestRank <= 3} />
            <KpiCell label="Total Views"  value={fmtViews(totalViews)} />
          </div>

          {/* Bio card */}
          {(artist.bio || artist.bio_khmer) && (
            <Panel label="About">
              <div className="space-y-2">
                {artist.bio && (
                  <p className="text-white/55 leading-relaxed text-xs">{artist.bio}</p>
                )}
                {artist.bio_khmer && (
                  <p className="text-white/30 leading-relaxed text-xs">{artist.bio_khmer}</p>
                )}
              </div>
            </Panel>
          )}

          {/* Social links */}
          {socialLinks.length > 0 && (
            <Panel label="Links">
              <div className="flex flex-col gap-1.5">
                {socialLinks.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between text-[10px] font-bold tracking-[0.15em] uppercase px-3 py-2 border border-white/8 text-white/40 hover:text-white hover:border-white/30 transition-colors"
                  >
                    <span>{link.label}</span>
                    <span className="text-white/20">↗</span>
                  </a>
                ))}
              </div>
            </Panel>
          )}

          {/* Platform IDs */}
          <Panel label="Platform IDs">
            <div className="space-y-3">
              {platformIds.map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[8px] font-black tracking-[0.25em] text-white/25 uppercase mb-0.5">{label}</p>
                  {value ? (
                    <p className="text-[10px] font-mono text-white/50 break-all leading-snug">{value}</p>
                  ) : (
                    <p className="text-[10px] font-mono text-white/15">—</p>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        {/* ── Main: Discography Table ── */}
        <div className="flex-1 min-w-0">
          {/* Table header bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <p className="text-[9px] font-black tracking-[0.5em] text-white/50 uppercase">Discography</p>
              <span className="text-[9px] font-mono text-white/20">{songs.length} songs</span>
            </div>
            <p className="text-[8px] tracking-[0.2em] text-white/20 uppercase">Sorted by views</p>
          </div>

          {/* Column headers */}
          <div
            className="hidden md:grid gap-3 px-3 py-2 mb-px text-[8px] font-black tracking-[0.3em] text-white/25 uppercase border border-white/[0.06] bg-white/[0.02]"
            style={{ gridTemplateColumns: '44px 36px 1fr 130px 90px 64px' }}
          >
            <span>Rank</span>
            <span />
            <span>Title</span>
            <span>Views</span>
            <span>Heat</span>
            <span>Play</span>
          </div>

          {/* Rows */}
          {songs.length === 0 ? (
            <div className="border border-white/[0.06] px-6 py-12 text-center text-white/25 text-sm">
              No songs indexed yet.
            </div>
          ) : (
            <div className="border border-white/[0.06] divide-y divide-white/[0.04]">
              {songs.map((song, i) => (
                <SongRow
                  key={song.heat_id}
                  song={song}
                  index={i}
                  maxViews={maxViews}
                  maxHeat={maxHeat}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/[0.06] bg-white/[0.015]">
      <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-[8px] font-black tracking-[0.4em] text-white/35 uppercase">{label}</p>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-start px-4 py-3 bg-black">
      <span className="text-[7px] font-black tracking-[0.35em] text-white/25 uppercase mb-1.5">{label}</span>
      <span
        className="text-xl md:text-2xl font-extralight tabular-nums"
        style={{ color: accent ? CYAN : 'rgba(255,255,255,0.85)' }}
      >
        {value}
      </span>
    </div>
  );
}

function SongRow({
  song,
  index,
  maxViews,
  maxHeat,
}: {
  song: Song;
  index: number;
  maxViews: number;
  maxHeat: number;
}) {
  const isRanked = song.rank != null;
  const isTop3   = isRanked && song.rank! <= 3;
  const isTop10  = isRanked && song.rank! <= 10;
  const color    = rankColor(song.rank);
  const viewsPct = song.views != null ? (song.views / maxViews) * 100 : 0;
  const heatPct  = song.heatScore != null ? (song.heatScore / maxHeat) * 100 : 0;

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors"
      style={isTop3 ? { borderLeft: `2px solid ${color}` } : { borderLeft: '2px solid transparent' }}
    >
      {/* Rank */}
      <div className="w-11 flex-shrink-0 text-right">
        {isRanked ? (
          <span className="text-sm font-black tabular-nums" style={{ color }}>
            #{song.rank}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-white/15">{index + 1}</span>
        )}
      </div>

      {/* Artwork */}
      <div className="flex-shrink-0 w-9 h-9 overflow-hidden bg-white/5" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
        {song.artwork_url ? (
          <img src={song.artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/80 truncate group-hover:text-white transition-colors leading-snug">
          {song.title || '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[8px] font-mono text-white/18">{song.heat_id}</span>
          {song.isrc && (
            <span className="text-[8px] font-mono text-white/25">· {song.isrc}</span>
          )}
        </div>
      </div>

      {/* Views + bar */}
      <div className="hidden md:block w-32 flex-shrink-0">
        {song.views != null ? (
          <>
            <div className="flex items-center justify-end mb-1">
              <span className="text-[11px] font-mono text-white/50">{fmtViews(song.views)}</span>
            </div>
            <div className="h-px bg-white/8 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-white/30"
                style={{ width: `${viewsPct}%` }}
              />
            </div>
          </>
        ) : (
          <span className="text-[10px] font-mono text-white/15">—</span>
        )}
      </div>

      {/* Heat score + bar */}
      <div className="hidden md:block w-[88px] flex-shrink-0">
        {song.heatScore != null ? (
          <>
            <div className="flex items-center justify-end mb-1">
              <span
                className="text-[11px] font-mono tabular-nums"
                style={{ color: isTop10 ? color : 'rgba(255,255,255,0.35)' }}
              >
                {Math.round(song.heatScore).toLocaleString()}
              </span>
            </div>
            <div className="h-px bg-white/8 relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${heatPct}%`,
                  background: isTop3 ? color : 'rgba(255,255,255,0.25)',
                }}
              />
            </div>
          </>
        ) : (
          <span className="text-[10px] font-mono text-white/15">—</span>
        )}
      </div>

      {/* Platform links */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-16 justify-end">
        {song.youtube_video_id && (
          <a
            href={`https://youtube.com/watch?v=${song.youtube_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] font-black tracking-[0.1em] uppercase px-2 py-1 border border-white/10 text-white/30 hover:text-white/80 hover:border-white/35 transition-colors"
          >
            YT
          </a>
        )}
        {song.apple_music_id && (
          <span className="text-[8px] font-black tracking-[0.1em] uppercase px-2 py-1 border border-white/8 text-white/18">AM</span>
        )}
        {song.spotify_id && (
          <span className="text-[8px] font-black tracking-[0.1em] uppercase px-2 py-1 border border-white/8 text-white/18">SP</span>
        )}
      </div>
    </div>
  );
}
