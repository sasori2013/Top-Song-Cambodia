import { NextRequest, NextResponse } from 'next/server';
import { getBigQueryClient } from '@/lib/bigquery';
import { isArtistId } from '@/lib/heat-ids';

const DS = 'heat_ranking';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isArtistId(id)) {
    return NextResponse.json({ error: 'Invalid artist ID' }, { status: 400 });
  }

  const bq = getBigQueryClient();
  if (!bq) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  try {
    // Artist profile
    const [[artist]] = await bq.query({
      query: `SELECT * FROM \`${DS}.heat_artists\` WHERE heat_artist_id = @id LIMIT 1`,
      params: { id },
    });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    // Songs linked to this artist (via canonical_artist match in heat_songs)
    const [songs] = await bq.query({
      query: `
        WITH latest AS (
          SELECT MAX(s.date) AS snap_date, MAX(r.date) AS rank_date
          FROM \`${DS}.snapshots\` s
          CROSS JOIN (SELECT MAX(date) AS date FROM \`${DS}.rank_history\` WHERE type = 'DAILY') r
        )
        SELECT
          hs.heat_id, hs.canonical_title, hs.youtube_video_id,
          hs.apple_music_id, hs.spotify_id, hs.isrc,
          hs.release_date, hs.artwork_url, hs.genres,
          snap.views, snap.likes,
          rh.rank, rh.heatScore
        FROM \`${DS}.heat_songs\` hs
        CROSS JOIN latest
        LEFT JOIN \`${DS}.snapshots\` snap
          ON hs.youtube_video_id = snap.videoId AND snap.date = latest.snap_date
        LEFT JOIN \`${DS}.rank_history\` rh
          ON hs.youtube_video_id = rh.videoId AND rh.date = latest.rank_date AND rh.type = 'DAILY'
        WHERE LOWER(hs.canonical_artist) = LOWER(@name)
        ORDER BY snap.views DESC NULLS LAST
        LIMIT 50
      `,
      params: { name: artist.name || '' },
    });

    // Chart appearance history (last 90 days)
    const [chartHistory] = await bq.query({
      query: `
        SELECT date, rank, heatScore
        FROM \`${DS}.rank_history\`
        WHERE videoId IN (
          SELECT youtube_video_id FROM \`${DS}.heat_songs\`
          WHERE LOWER(canonical_artist) = LOWER(@name)
            AND youtube_video_id IS NOT NULL
        )
        AND type = 'DAILY'
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        ORDER BY date DESC
        LIMIT 200
      `,
      params: { name: artist.name || '' },
    });

    return NextResponse.json({ artist, songs, chartHistory });
  } catch (e: any) {
    console.error('[API /artists/[id]]', e.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
