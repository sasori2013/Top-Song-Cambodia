import { NextResponse } from 'next/server';
import { getBigQueryClient } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET    = 'heat_ranking';

export interface ProvinceHeat {
  id: string;
  value: number;
  topArtist: string;
}

export interface TrendArtist {
  name: string;
  rank: number;
  score: number;
}

export interface CambodiaTrendsResponse {
  runDate: string;
  provinces: ProvinceHeat[];
  top3: TrendArtist[];
}

let cache: { data: CambodiaTrendsResponse; ts: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function loadFromBigQuery(): Promise<CambodiaTrendsResponse> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery client not available');

  const [dateRows] = await bq.query(`
    SELECT FORMAT_DATE('%Y-%m-%d', MAX(run_date)) AS run_date
    FROM \`${PROJECT_ID}.${DATASET}.trends_score_matrix\`
  `);
  const runDate: string = (dateRows[0] as any)?.run_date ?? '';
  if (!runDate) return { runDate: '', provinces: [], top3: [] };

  // 州ごとの最大スコアとTop1アーティスト（ヒートマップ用）
  const [provRows] = await bq.query(`
    SELECT
      province_id,
      MAX(score) AS heat_value,
      ARRAY_AGG(artist_name ORDER BY score DESC LIMIT 1)[OFFSET(0)] AS top_artist
    FROM \`${PROJECT_ID}.${DATASET}.trends_score_matrix\`
    WHERE FORMAT_DATE('%Y-%m-%d', run_date) = '${runDate}'
    GROUP BY province_id
  `);

  // 全国Top3（各州スコアの平均で算出）
  const [artistRows] = await bq.query(`
    SELECT artist_name, AVG(score) AS national_score
    FROM \`${PROJECT_ID}.${DATASET}.trends_score_matrix\`
    WHERE FORMAT_DATE('%Y-%m-%d', run_date) = '${runDate}'
    GROUP BY artist_name
    ORDER BY national_score DESC
    LIMIT 3
  `);

  const data: CambodiaTrendsResponse = {
    runDate,
    provinces: provRows.map((r: any) => ({
      id:        r.province_id,
      value:     Math.round(r.heat_value ?? 0),
      topArtist: r.top_artist ?? '',
    })),
    top3: artistRows.map((r: any, i: number) => ({
      name:  r.artist_name,
      rank:  i + 1,
      score: Math.round(r.national_score ?? 0),
    })),
  };

  cache = { data, ts: Date.now() };
  return data;
}

export async function GET() {
  try {
    const data = await loadFromBigQuery();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (err: any) {
    console.error('[trends/cambodia]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
