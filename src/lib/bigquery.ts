import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID;

export function getBigQueryClient() {
  const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim();
  let credentials;

  try {
    const cleanJson = rawJson.replace(/^['"]|['"]$/g, '');
    credentials = JSON.parse(cleanJson);
    
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    if (!credentials.client_email || (!PROJECT_ID && !credentials.project_id)) {
      throw new Error("Missing required fields in service account JSON");
    }

    return new BigQuery({
      projectId: PROJECT_ID || credentials.project_id,
      credentials,
    });
  } catch (e) {
    console.error("BigQuery Client Init Error:", e);
    return null;
  }
}

import { GoogleAuth } from 'google-auth-library';

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const PROJECT_ID = process.env.GCP_PROJECT_ID;
  const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim().replace(/^['"]|['"]$/g, '');
  const LOCATION = 'us-central1';

  try {
    const credentials = JSON.parse(rawJson);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/text-embedding-004:predict`;

    const body = {
      instances: [
        {
          content: text,
          task_type: 'RETRIEVAL_QUERY'
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.predictions && data.predictions[0]) {
      return data.predictions[0].embeddings.values;
    } else {
      console.error("Vertex AI Error Response:", JSON.stringify(data));
      return null;
    }
  } catch (error) {
    console.error("Embedding Generation Error:", error);
    return null;
  }
}

import { RankingResponse, RankingItem } from './types';

export async function getRankingDataFromBQ(): Promise<RankingResponse | null> {
  const bq = getBigQueryClient();
  if (!bq) return null;

  const DATASET_ID = 'heat_ranking';

  try {
    // 1. Get Latest Ranking Date
    const [dateRows] = await bq.query(`
      SELECT MAX(date) as d FROM \`${DATASET_ID}.rank_history\` WHERE type = 'DAILY'
    `);
    if (dateRows.length === 0 || !dateRows[0].d) return null;
    const latestDate = dateRows[0].d.value;

    // 2. Fetch Top 40 Ranking
    const rankingQuery = `
      SELECT 
        r.rank, r.heatScore, r.videoId,
        s.artist, s.title, s.publishedAt,
        snap.views as totalV,
        prev_snap.views as prevV,
        prev_rank.rank as prevRank,
        r.aiScore, r.aiInsight
      FROM \`${DATASET_ID}.rank_history\` r
      JOIN \`${DATASET_ID}.songs_master\` s ON r.videoId = s.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` snap ON r.videoId = snap.videoId AND snap.date = r.date
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev_snap ON r.videoId = prev_snap.videoId AND prev_snap.date = DATE_SUB(r.date, INTERVAL 1 DAY)
      LEFT JOIN \`${DATASET_ID}.rank_history\` prev_rank ON r.videoId = prev_rank.videoId AND prev_rank.date = DATE_SUB(r.date, INTERVAL 1 DAY) AND prev_rank.type = 'DAILY'
      WHERE r.date = '${latestDate}' AND r.type = 'DAILY'
      ORDER BY r.rank ASC
      LIMIT 40
    `;
    const [rankingRows] = await bq.query(rankingQuery);

    // 3. Fetch Weekly Volume Trend AND Growth Calculation in SQL
    const trendQuery = `
      WITH daily_stats AS (
        SELECT 
          date,
          videoId,
          views,
          LAG(views) OVER(PARTITION BY videoId ORDER BY date) as prev_views
        FROM \`${DATASET_ID}.snapshots\`
        WHERE date >= DATE_SUB(DATE '${latestDate}', INTERVAL 15 DAY)
      ),
      daily_increase AS (
        SELECT 
          date,
          SUM(CASE WHEN views > prev_views THEN views - prev_views ELSE 0 END) as total_dv
        FROM daily_stats
        WHERE prev_views IS NOT NULL
        GROUP BY date
      ),
      growth_stats AS (
        SELECT 
          SUM(CASE WHEN date > DATE_SUB(DATE '${latestDate}', INTERVAL 7 DAY) THEN total_dv ELSE 0 END) as this_week,
          SUM(CASE WHEN date <= DATE_SUB(DATE '${latestDate}', INTERVAL 7 DAY) AND date > DATE_SUB(DATE '${latestDate}', INTERVAL 14 DAY) THEN total_dv ELSE 0 END) as last_week
        FROM daily_increase
        WHERE date <= DATE '${latestDate}'
      )
      SELECT 
        di.total_dv, di.date,
        gs.this_week, gs.last_week
      FROM daily_increase di, growth_stats gs
      ORDER BY date ASC
    `;
    const [trendRows] = await bq.query(trendQuery);

    // 4. Global Stats
    const [countRows] = await bq.query(`
      SELECT 
        (SELECT COUNT(DISTINCT artist) FROM \`${DATASET_ID}.songs_master\`) as totalArtists,
        (SELECT COUNT(*) FROM \`${DATASET_ID}.songs_master\`) as totalSongs
    `);

    // 5. Format Response
    const trendValues = trendRows.map(r => r.total_dv);
    
    // Growth from SQL results (all rows have same GS values)
    const thisWeekSum = trendRows[0]?.this_week || 0;
    const prevWeekSum = trendRows[0]?.last_week || 0;
    
    const heatGrowth = prevWeekSum > 0 ? ((thisWeekSum - prevWeekSum) / prevWeekSum) * 100 : 0;
    
    console.log(`Growth Check [${latestDate}]: ThisWeek=${thisWeekSum}, PrevWeek=${prevWeekSum}, Growth=${heatGrowth}%`);

    const ranking = rankingRows.map(r => {
      const dv = Math.max(0, (r.totalV || 0) - (r.prevV || 0));
      const growth = r.prevV ? (dv / r.prevV) * 100 : 0;
      const rankChange = r.prevRank ? r.prevRank - r.rank : 'NEW';
      
      return {
        rank: r.rank,
        artist: r.artist,
        title: r.title,
        views: r.totalV || 0,
        dailyViews: dv,
        growth: Math.round(growth * 100) / 100,
        heatScore: r.heatScore,
        rankChange: rankChange,
        videoId: r.videoId,
        thumbnail: `https://img.youtube.com/vi/${r.videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${r.videoId}`,
        publishedAt: r.publishedAt?.value || r.publishedAt,
        aiScore: r.aiScore,
        aiInsight: r.aiInsight
      } as RankingItem;
    });

    return {
      updatedAt: latestDate,
      stats: {
        totalArtists: countRows[0].totalArtists,
        totalProductions: 12,
        totalSongs: countRows[0].totalSongs,
        heatGrowth: Math.round(heatGrowth * 10) / 10,
        heatTrend: trendValues
      },
      ranking: ranking
    } as RankingResponse;

  } catch (error) {
    console.error('BigQuery Data Fetch Error:', error);
    return null;
  }
}
