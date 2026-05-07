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

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isArtistId(id)) notFound();

  const data = await getArtistData(id);
  if (!data) notFound();

  const { artist, songs } = data;

  const totalViews = songs.reduce((sum, s) => sum + (s.views ?? 0), 0);
  const rankedSongs = songs.filter(s => s.rank != null);
  const genreList = artist.genres?.split(',').map(g => g.trim()).filter(Boolean) ?? [];

  const socialLinks: { label: string; href: string }[] = [
    artist.youtube_channel_id
      ? { label: 'YouTube', href: `https://youtube.com/channel/${artist.youtube_channel_id}` }
      : null,
    artist.facebook_url ? { label: 'Facebook', href: artist.facebook_url } : null,
    artist.instagram_url ? { label: 'Instagram', href: artist.instagram_url } : null,
    artist.tiktok_url ? { label: 'TikTok', href: artist.tiktok_url } : null,
    artist.website_url ? { label: 'Website', href: artist.website_url } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  const initial = (artist.name || '?')[0].toUpperCase();

  return (
    <main className="relative bg-black min-h-screen overflow-hidden">
      <AuraR3F color="rgba(0, 229, 255, 0.06)" fullscreen progress={0} hideCluster />
      <Header />

      {/* ── Hero ── */}
      <section className="relative z-10 pt-40 pb-20 px-6 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-end gap-10">

          {/* Avatar */}
          <div className="flex-shrink-0">
            {artist.profile_image_url ? (
              <img
                src={artist.profile_image_url}
                alt={artist.name}
                className="w-28 h-28 md:w-36 md:h-36 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div
                className="w-28 h-28 md:w-36 md:h-36 rounded-full flex items-center justify-center border border-white/10"
                style={{ background: 'radial-gradient(circle at 40% 40%, rgba(0,229,255,0.12), rgba(0,0,0,0.8))' }}
              >
                <span className="text-5xl md:text-6xl font-extralight text-white/70 select-none">
                  {initial}
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            {/* Labels */}
            <div className="flex items-center gap-3 mb-3">
              {artist.is_cambodian !== false && (
                <span
                  className="text-[9px] font-black tracking-[0.25em] uppercase px-2.5 py-1"
                  style={{
                    color: CYAN,
                    border: `1px solid ${CYAN}40`,
                    background: `${CYAN}10`,
                    clipPath: 'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)',
                  }}
                >
                  Cambodian Artist
                </span>
              )}
              {artist.country && artist.country !== 'KH' && (
                <span className="text-[9px] font-black tracking-[0.25em] uppercase px-2.5 py-1 border border-white/20 text-white/50">
                  {artist.country}
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extralight tracking-tighter text-white leading-none mb-2">
              {artist.name}
            </h1>
            {artist.name_khmer && (
              <p className="text-xl md:text-2xl font-light text-white/40 tracking-wider mb-4">
                {artist.name_khmer}
              </p>
            )}

            {/* Genre tags */}
            {genreList.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {genreList.map(g => (
                  <span key={g} className="text-[10px] font-medium tracking-[0.15em] uppercase text-white/40 border border-white/10 px-2 py-0.5 rounded-sm">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Social links */}
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {socialLinks.map(link => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1.5 border border-white/20 text-white/50 hover:text-white hover:border-white/50 transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="max-w-5xl mx-auto mt-12">
          <div className="flex items-stretch border border-white/5 divide-x divide-white/5 w-fit">
            <StatCell label="Indexed Songs" value={songs.length.toLocaleString()} />
            <StatCell label="Chart Entries" value={rankedSongs.length.toLocaleString()} />
            <StatCell
              label="Total YouTube Views"
              value={totalViews >= 1_000_000
                ? `${(totalViews / 1_000_000).toFixed(1)}M`
                : totalViews >= 1_000
                ? `${(totalViews / 1_000).toFixed(0)}K`
                : totalViews.toLocaleString()}
            />
            <StatCell label="HEAT ID" value={artist.heat_artist_id} mono dim />
          </div>
        </div>
      </section>

      {/* ── Bio ── */}
      {(artist.bio || artist.bio_khmer) && (
        <section className="relative z-10 py-16 px-6 border-b border-white/5">
          <div className="max-w-5xl mx-auto">
            <SectionLabel>About</SectionLabel>
            <div className="max-w-2xl space-y-3 mt-4">
              {artist.bio && (
                <p className="text-white/60 leading-relaxed text-sm md:text-base">{artist.bio}</p>
              )}
              {artist.bio_khmer && (
                <p className="text-white/40 leading-relaxed text-sm">{artist.bio_khmer}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Discography ── */}
      <section className="relative z-10 py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <SectionLabel>Discography</SectionLabel>
            <span className="text-[10px] font-medium tracking-[0.15em] text-white/20 uppercase">
              {songs.length} songs indexed
            </span>
          </div>

          {songs.length === 0 ? (
            <p className="text-white/30 text-sm">No songs indexed yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {songs.map((song, i) => (
                <SongRow key={song.heat_id} song={song} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Platform identifiers ── */}
      <section className="relative z-10 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionLabel>Platform Identifiers</SectionLabel>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5">
            {[
              { label: 'HEAT Artist ID', value: artist.heat_artist_id },
              { label: 'YouTube Channel', value: artist.youtube_channel_id },
              { label: 'Spotify Artist', value: artist.spotify_artist_id },
              { label: 'Apple Music Artist', value: artist.apple_music_artist_id },
            ].map(({ label, value }) => (
              <div key={label} className="bg-black px-4 py-4">
                <p className="text-[9px] font-black tracking-[0.25em] text-white/30 uppercase mb-1.5">{label}</p>
                {value ? (
                  <p className="text-[11px] font-mono text-white/60 break-all">{value}</p>
                ) : (
                  <p className="text-[11px] font-mono text-white/15">—</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] md:text-[11px] font-black tracking-[0.8em] text-white uppercase pl-[0.8em]">
      {children}
    </p>
  );
}

function StatCell({
  label, value, mono, dim,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col items-start px-6 py-4">
      <span className="text-[9px] font-black tracking-[0.4em] text-white/30 uppercase mb-2">{label}</span>
      <span
        className={`tabular-nums ${mono ? 'font-mono text-sm' : 'text-2xl md:text-3xl font-extralight'} ${dim ? 'text-white/30' : 'text-white/90'}`}
      >
        {value}
      </span>
    </div>
  );
}

function SongRow({ song, index }: { song: Song; index: number }) {
  const isRanked = song.rank != null;
  const isTop10 = song.rank != null && song.rank <= 10;

  return (
    <div className="group flex items-center gap-4 py-3 hover:bg-white/[0.02] transition-colors">

      {/* Index / Rank */}
      <div className="w-10 text-right flex-shrink-0">
        {isRanked ? (
          <span
            className="text-[11px] font-black"
            style={{ color: isTop10 ? '#00E5FF' : 'rgba(255,255,255,0.5)' }}
          >
            #{song.rank}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-white/15">{index + 1}</span>
        )}
      </div>

      {/* Artwork */}
      <div className="flex-shrink-0 w-10 h-10 bg-white/5 border border-white/5 overflow-hidden">
        {song.artwork_url ? (
          <img src={song.artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" />
        )}
      </div>

      {/* Title + HEAT ID */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/90 truncate group-hover:text-white transition-colors">
          {song.title || '—'}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[9px] font-mono text-white/20">{song.heat_id}</span>
          {song.isrc && (
            <span className="text-[9px] font-mono text-white/30">ISRC: {song.isrc}</span>
          )}
        </div>
      </div>

      {/* Views */}
      {song.views != null && (
        <div className="hidden md:block text-right flex-shrink-0 w-20">
          <span className="text-[11px] font-mono text-white/40">
            {song.views >= 1_000_000
              ? `${(song.views / 1_000_000).toFixed(1)}M`
              : `${(song.views / 1_000).toFixed(0)}K`}
          </span>
          <p className="text-[8px] tracking-[0.2em] text-white/20 uppercase">views</p>
        </div>
      )}

      {/* Heat Score */}
      {song.heatScore != null && (
        <div className="hidden md:block text-right flex-shrink-0 w-16">
          <span
            className="text-[13px] font-extralight tabular-nums"
            style={{ color: isTop10 ? '#00E5FF' : 'rgba(255,255,255,0.5)' }}
          >
            {Math.round(song.heatScore).toLocaleString()}
          </span>
          <p className="text-[8px] tracking-[0.2em] text-white/20 uppercase">heat</p>
        </div>
      )}

      {/* Platform links */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {song.youtube_video_id && (
          <a
            href={`https://youtube.com/watch?v=${song.youtube_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-black tracking-[0.15em] uppercase px-2 py-1 border border-white/10 text-white/30 hover:text-white/70 hover:border-white/30 transition-colors"
          >
            YT
          </a>
        )}
        {song.apple_music_id && (
          <span className="text-[9px] font-black tracking-[0.15em] uppercase px-2 py-1 border border-white/10 text-white/20">
            AM
          </span>
        )}
        {song.spotify_id && (
          <span className="text-[9px] font-black tracking-[0.15em] uppercase px-2 py-1 border border-white/10 text-white/20">
            SP
          </span>
        )}
      </div>
    </div>
  );
}
