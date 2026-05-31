import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AuraR3F } from '@/components/AuraR3F';
import { getBigQueryClient } from '@/lib/bigquery';
import { isArtistId } from '@/lib/heat-ids';
import { ArtistTabs } from './ArtistTabs';
import type { Analytics, Song, Release } from './ArtistTabs';

export const dynamic = 'force-dynamic';

const DS   = 'heat_ranking';
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

// ── Data fetching ──────────────────────────────────────────────────────────────

async function getArtistData(id: string): Promise<{
  artist: Artist;
  songs: Song[];
  releases: Release[];
  fbData: { fb_views: number; fb_reactions: number };
  cambodiaRank: number | null;
  totalArtists: number;
  avgPeakRank: number | null;
} | null> {
  const bq = getBigQueryClient();
  if (!bq) return null;

  try {
    const [[raw]] = await bq.query({
      query: `SELECT * FROM \`${DS}.heat_artists\` WHERE heat_artist_id = @id LIMIT 1`,
      params: { id },
    });
    if (!raw) return null;

    const artist: Artist = {
      heat_artist_id:        String(raw.heat_artist_id ?? ''),
      name:                  String(raw.name ?? ''),
      name_khmer:            raw.name_khmer ?? null,
      youtube_channel_id:    raw.youtube_channel_id ?? null,
      spotify_artist_id:     raw.spotify_artist_id ?? null,
      apple_music_artist_id: raw.apple_music_artist_id ?? null,
      bio:                   raw.bio ?? null,
      bio_khmer:             raw.bio_khmer ?? null,
      country:               raw.country ?? null,
      is_cambodian:          raw.is_cambodian ?? null,
      genres:                raw.genres ?? null,
      profile_image_url:     raw.profile_image_url ?? null,
      facebook_url:          raw.facebook_url ?? null,
      instagram_url:         raw.instagram_url ?? null,
      tiktok_url:            raw.tiktok_url ?? null,
      website_url:           raw.website_url ?? null,
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
          CAST(snap.views AS INT64) AS views,
          CAST(rh.rank   AS INT64) AS rank,
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

    const [rawReleases] = await bq.query({
      query: `
        SELECT
          r.release_id,
          r.album_name,
          r.release_type,
          r.track_count,
          CAST(r.first_release_date AS STRING) AS first_release_date,
          r.apple_music_url
        FROM \`${DS}.heat_releases\` r
        JOIN \`${DS}.artists_master\` a  ON r.artist_id = a.channelId
        JOIN \`${DS}.heat_artists\` ha   ON ha.youtube_channel_id = a.channelId
        WHERE ha.heat_artist_id = @id
          AND r.track_count >= 3
        ORDER BY r.first_release_date DESC NULLS LAST
      `,
      params: { id },
    });

    const releases: Release[] = rawReleases.map((r: any) => ({
      release_id:         String(r.release_id ?? ''),
      album_name:         String(r.album_name ?? ''),
      release_type:       String(r.release_type ?? 'album'),
      track_count:        Number(r.track_count ?? 0),
      first_release_date: r.first_release_date ?? null,
      apple_music_url:    r.apple_music_url ?? null,
    }));

    const [fbRows] = await bq.query({
      query: `
        SELECT
          COALESCE(SUM(views), 0)     AS fb_views,
          COALESCE(SUM(reactions), 0) AS fb_reactions
        FROM \`${DS}.fb_posts\`
        WHERE artist_id = @channelId
          AND ai_category != 'unrelated'
      `,
      params: { channelId: artist.youtube_channel_id ?? '' },
    });
    const fbData = fbRows[0] ?? { fb_views: 0, fb_reactions: 0 };

    // Cambodia rank + avg peak rank (parallel, non-fatal)
    let cambodiaRank: number | null = null;
    let totalArtists = 0;
    let avgPeakRank: number | null = null;
    try {
      const [[rankRows], [cntRows], [peakRows]] = await Promise.all([
        // Cambodia rank among artists with YouTube data
        bq.query({
          query: `
            WITH totals AS (
              SELECT hs.canonical_artist, COALESCE(SUM(snap.views), 0) AS v
              FROM \`${DS}.heat_songs\` hs
              LEFT JOIN \`${DS}.snapshots\` snap
                ON snap.videoId = hs.youtube_video_id
               AND snap.date = (SELECT MAX(date) FROM \`${DS}.snapshots\`)
              GROUP BY hs.canonical_artist
            )
            SELECT
              (SELECT COUNT(*) FROM totals
               WHERE v > (SELECT v FROM totals WHERE LOWER(canonical_artist) = LOWER(@name) LIMIT 1)
              ) + 1 AS cambodia_rank
            FROM totals LIMIT 1
          `,
          params: { name: artist.name },
        }),
        // Total artists: heat_songs UNION label_roster (deduplicated)
        bq.query({
          query: `
            SELECT COUNT(DISTINCT artist) AS total_artists
            FROM (
              SELECT LOWER(TRIM(canonical_artist)) AS artist FROM \`${DS}.heat_songs\`
              UNION DISTINCT
              SELECT LOWER(TRIM(targetArtist))     AS artist FROM \`${DS}.label_roster\`
              WHERE targetArtist IS NOT NULL AND TRIM(targetArtist) != ''
            )
          `,
        }),
        // Avg peak rank per charted song
        bq.query({
          query: `
            SELECT ROUND(AVG(best_rank), 1) AS avg_peak_rank
            FROM (
              SELECT videoId, MIN(rank) AS best_rank
              FROM \`${DS}.rank_history\`
              WHERE type = 'DAILY'
                AND videoId IN (
                  SELECT youtube_video_id FROM \`${DS}.heat_songs\`
                  WHERE LOWER(canonical_artist) = LOWER(@name)
                    AND youtube_video_id IS NOT NULL
                )
              GROUP BY videoId
            )
          `,
          params: { name: artist.name },
        }),
      ]);
      cambodiaRank = rankRows[0]?.cambodia_rank != null ? Number(rankRows[0].cambodia_rank) : null;
      totalArtists = cntRows[0]?.total_artists  != null ? Number(cntRows[0].total_artists)  : 0;
      avgPeakRank  = peakRows[0]?.avg_peak_rank  != null ? Number(peakRows[0].avg_peak_rank)  : null;
    } catch { /* non-fatal */ }

    return { artist, songs, releases, fbData, cambodiaRank, totalArtists, avgPeakRank };
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
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isArtistId(id)) notFound();

  const data = await getArtistData(id);
  if (!data) notFound();

  const { artist, songs, releases, fbData, cambodiaRank, totalArtists, avgPeakRank } = data;

  // Derived stats
  const totalViews  = songs.reduce((sum, s) => sum + (s.views ?? 0), 0);
  const rankedSongs = songs.filter(s => s.rank != null);
  const bestRank    = rankedSongs.length ? Math.min(...rankedSongs.map(s => s.rank!)) : null;
  const genreList   = artist.genres?.split(',').map(g => g.trim()).filter(Boolean) ?? [];
  const maxViews    = Math.max(...songs.map(s => s.views ?? 0), 1);
  const maxHeat     = Math.max(...songs.map(s => s.heatScore ?? 0), 1);
  const initial     = (artist.name || '?')[0].toUpperCase();
  // Analytics (computed server-side, passed to client)
  const songsWithViews = songs.filter(s => s.views != null);
  const songsWithHeat  = songs.filter(s => s.heatScore != null);
  const megaHits       = songsWithViews.filter(s => s.views! >= 3_000_000);

  const analytics: Analytics = {
    totalSongs:   songs.length,
    megaHits:     megaHits.length,
    megaHitRate:  songsWithViews.length > 0 ? megaHits.length / songsWithViews.length : 0,
    avgViews:     songsWithViews.length > 0
      ? Math.round(songsWithViews.reduce((sum, s) => sum + s.views!, 0) / songsWithViews.length)
      : 0,
    avgHeat:      songsWithHeat.length > 0
      ? Math.round(songsWithHeat.reduce((sum, s) => sum + s.heatScore!, 0) / songsWithHeat.length)
      : 0,
    chartRate:    songs.length > 0 ? rankedSongs.length / songs.length : 0,
    chartSongs:   rankedSongs.length,
    youtubeCount:   songs.filter(s => s.youtube_video_id).length,
    appleCount:     songs.filter(s => s.apple_music_id).length,
    spotifyCount:   songs.filter(s => s.spotify_id).length,
    facebookLinked: !!artist.facebook_url,
    tiktokLinked:   !!artist.tiktok_url,
    ytTotalViews:   totalViews,
    fbEngagement:   Number(fbData.fb_views ?? 0) + Number(fbData.fb_reactions ?? 0),
    top3Count:    songs.filter(s => s.rank != null && s.rank <= 3).length,
    top10Count:   songs.filter(s => s.rank != null && s.rank <= 10).length,
    viewBuckets: [
      { label: '> 100M', count: songsWithViews.filter(s => s.views! >= 100_000_000).length },
      { label: '> 10M',  count: songsWithViews.filter(s => s.views! >= 10_000_000 && s.views! < 100_000_000).length },
      { label: '> 1M',   count: songsWithViews.filter(s => s.views! >= 1_000_000  && s.views! < 10_000_000).length },
      { label: '> 100K', count: songsWithViews.filter(s => s.views! >= 100_000    && s.views! < 1_000_000).length },
      { label: '< 100K', count: songsWithViews.filter(s => s.views! < 100_000).length },
    ],
    cambodiaRank,
    totalArtists,
    avgPeakRank,
    fbReactionRate: Number(fbData.fb_views) > 0
      ? Number(fbData.fb_reactions) / Number(fbData.fb_views)
      : null,
    releaseCount: releases.length,
  };

  const socialLinks: { label: string; href: string }[] = [
    artist.youtube_channel_id ? { label: 'YouTube',    href: `https://youtube.com/channel/${artist.youtube_channel_id}` } : null,
    artist.facebook_url       ? { label: 'Facebook',   href: artist.facebook_url  } : null,
    artist.instagram_url      ? { label: 'Instagram',  href: artist.instagram_url } : null,
    artist.tiktok_url         ? { label: 'TikTok',     href: artist.tiktok_url    } : null,
    artist.website_url        ? { label: 'Website',    href: artist.website_url   } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <main className="relative bg-black min-h-screen">
      <AuraR3F color="rgba(0, 229, 255, 0.04)" fullscreen progress={0} hideCluster />
      <Header />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-28 pb-6 px-6 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-black tracking-[0.35em] text-white/20 uppercase">Artist Profile</span>
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
              <span
                className="absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-black"
                style={{ background: CYAN }}
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {artist.is_cambodian !== false && (
                  <span
                    className="text-[10px] font-black tracking-[0.25em] uppercase px-2 py-0.5"
                    style={{ color: CYAN, border: `1px solid ${CYAN}40`, background: `${CYAN}0f` }}
                  >
                    Cambodian
                  </span>
                )}
                {artist.country && artist.country !== 'KH' && (
                  <span className="text-[10px] font-black tracking-[0.25em] uppercase px-2 py-0.5 border border-white/15 text-white/40">
                    {artist.country}
                  </span>
                )}
                {genreList.map(g => (
                  <span key={g} className="text-[10px] tracking-[0.15em] uppercase text-white/30 border border-white/8 px-2 py-0.5">
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

            {/* KPIs */}
            <div className="hidden md:grid grid-cols-4 gap-px bg-white/[0.06] flex-shrink-0 border border-white/[0.06]">
              <KpiCell label="Songs"         value={songs.length.toString()} />
              <KpiCell label="Best Rank"     value={bestRank != null ? `#${bestRank}` : '—'} accent={bestRank != null && bestRank <= 3} />
              <KpiCell label="Total Views"   value={fmtViews(totalViews)} />
              <KpiCell label="Chart Entries" value={rankedSongs.length.toString()} accent={rankedSongs.length > 0} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-6">

        {/* Sidebar */}
        <aside className="md:w-56 flex-shrink-0 space-y-4">

          {/* Mobile KPIs */}
          <div className="md:hidden grid grid-cols-2 gap-px bg-white/[0.06] border border-white/[0.06]">
            <KpiCell label="Songs"         value={songs.length.toString()} />
            <KpiCell label="Best Rank"     value={bestRank != null ? `#${bestRank}` : '—'} accent={bestRank != null && bestRank <= 3} />
            <KpiCell label="Total Views"   value={fmtViews(totalViews)} />
            <KpiCell label="Chart Entries" value={rankedSongs.length.toString()} accent={rankedSongs.length > 0} />
          </div>

          {/* Bio */}
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

          {/* Links */}
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

          {/* IDs */}
          <Panel label="System IDs">
            <div className="space-y-3">
              {[
                { label: 'HEAT Artist ID',     value: artist.heat_artist_id },
                { label: 'YouTube Channel',    value: artist.youtube_channel_id },
                { label: 'Spotify Artist',     value: artist.spotify_artist_id },
                { label: 'Apple Music Artist', value: artist.apple_music_artist_id },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-black tracking-[0.2em] text-white/30 uppercase mb-0.5">{label}</p>
                  {value ? (
                    <p className="text-xs font-mono text-white/50 break-all leading-snug">{value}</p>
                  ) : (
                    <p className="text-xs font-mono text-white/15">—</p>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        {/* Main: Tabs */}
        <div className="flex-1 min-w-0">
          <ArtistTabs
            songs={songs}
            releases={releases}
            analytics={analytics}
            maxViews={maxViews}
            maxHeat={maxHeat}
          />
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
      <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-[10px] font-black tracking-[0.3em] text-white/40 uppercase">{label}</p>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function KpiCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-start px-4 py-3 bg-black">
      <span className="text-[10px] font-black tracking-[0.2em] text-white/30 uppercase mb-1.5">{label}</span>
      <span
        className="text-xl md:text-2xl font-extralight tabular-nums"
        style={{ color: accent ? CYAN : 'rgba(255,255,255,0.85)' }}
      >
        {value}
      </span>
    </div>
  );
}
