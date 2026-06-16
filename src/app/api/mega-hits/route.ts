import { getBigQueryClient } from '@/lib/bigquery';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DATASET_ID = 'heat_ranking';
const THRESHOLD = 5_000_000;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const summary  = searchParams.get('summary') === 'true';
  const year     = searchParams.get('year');        // e.g. "2021"
  const page     = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const pageSize = Math.min(100, parseInt(searchParams.get('size') || '50'));
  const tier     = searchParams.get('tier') || 'all';
  const offset   = (page - 1) * pageSize;

  const tierFilter: Record<string, string> = {
    all:  `views >= ${THRESHOLD}`,
    '100m': 'views >= 100000000',
    '50m':  'views >= 50000000  AND views < 100000000',
    '20m':  'views >= 20000000  AND views < 50000000',
    '10m':  'views >= 10000000  AND views < 20000000',
    '5m':   'views >= 5000000   AND views < 10000000',
  };
  const baseWhere = tierFilter[tier] || tierFilter.all;
  const yearWhere = year ? ` AND EXTRACT(YEAR FROM DATE(publishedAt)) = ${parseInt(year)}` : '';
  const where = baseWhere + yearWhere;

  try {
    const bq = getBigQueryClient();
    if (!bq) return NextResponse.json({ error: 'BQ unavailable' }, { status: 500 });

    // Summary mode: return per-year counts + top song for accordion headers
    if (summary) {
      const [rows] = await bq.query(`
        SELECT
          EXTRACT(YEAR FROM DATE(publishedAt)) AS year,
          COUNT(*) AS cnt,
          MAX(views) AS top_views,
          ARRAY_AGG(
            STRUCT(videoId, artist, COALESCE(NULLIF(cleanTitle,''), title) AS title, views)
            ORDER BY views DESC LIMIT 1
          )[OFFSET(0)] AS top_song
        FROM \`${DATASET_ID}.songs_master\`
        WHERE views >= ${THRESHOLD} AND publishedAt IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
      `);
      return NextResponse.json({
        years: rows.map((r: any) => ({
          year:      Number(r.year),
          count:     Number(r.cnt),
          topViews:  Number(r.top_views),
          topSong: {
            videoId:   r.top_song.videoId,
            artist:    r.top_song.artist,
            title:     r.top_song.title,
            views:     Number(r.top_song.views),
            thumbnail: `https://img.youtube.com/vi/${r.top_song.videoId}/hqdefault.jpg`,
          },
        })),
      });
    }

    const [[countRow], [rows]] = await Promise.all([
      bq.query(`SELECT COUNT(*) as total FROM \`${DATASET_ID}.songs_master\` WHERE ${where}`),
      bq.query(`
        SELECT
          videoId,
          artist,
          COALESCE(NULLIF(cleanTitle, ''), title) AS title,
          views,
          genre,
          publishedAt
        FROM \`${DATASET_ID}.songs_master\`
        WHERE ${where}
        ORDER BY views DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `),
    ]);

    const total = Number(countRow[0].total);
    const items = rows.map((r: any, i: number) => ({
      rank:        offset + i + 1,
      videoId:     r.videoId,
      artist:      r.artist,
      title:       r.title,
      views:       Number(r.views),
      genre:       r.genre || '',
      publishedAt: r.publishedAt?.value || r.publishedAt || '',
      thumbnail:   `https://img.youtube.com/vi/${r.videoId}/hqdefault.jpg`,
    }));

    return NextResponse.json({ total, page, pageSize, tier, year: year || null, items });
  } catch (e: any) {
    console.error('mega-hits API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
