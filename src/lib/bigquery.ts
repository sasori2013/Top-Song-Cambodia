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

export async function searchSongsByVector(queryText: string, limit: number = 5): Promise<any[]> {
  const bq = getBigQueryClient();
  if (!bq) return [];

  const vector = await generateEmbedding(queryText);
  if (!vector) return [];

  const DATASET_ID = 'heat_ranking';
  const TABLE_VECTORS = 'songs_vector';
  const TABLE_SONGS = 'songs_master';

  const bqQuery = `
    SELECT 
      s.title, 
      s.artist,
      s.videoId,
      s.eventTag,
      s.category,
      s.publishedAt,
      snap.views,
      (SELECT SUM(a*b) / (SQRT(SUM(a*a)) * SQRT(SUM(b*b))) 
       FROM UNNEST(v.embedding) a WITH OFFSET pos
       JOIN UNNEST(@queryVector) b WITH OFFSET pos2 ON pos = pos2
      ) as cosine_similarity
    FROM \`${DATASET_ID}.${TABLE_VECTORS}\` v
    JOIN \`${DATASET_ID}.${TABLE_SONGS}\` s ON v.videoId = s.videoId
    LEFT JOIN \`${DATASET_ID}.snapshots\` snap ON v.videoId = snap.videoId 
      AND snap.date = (SELECT MAX(date) FROM \`${DATASET_ID}.snapshots\`)
    ORDER BY cosine_similarity DESC
    LIMIT @limit
  `;

  try {
    const [results] = await bq.query({
      query: bqQuery,
      params: { queryVector: vector, limit: limit },
    });
    return results;
  } catch (error) {
    console.error("Vector Search Error:", error);
    return [];
  }
}


import { RankingResponse, RankingItem } from './types';

export async function getRankingDataFromBQ(): Promise<RankingResponse | null> {
  const bq = getBigQueryClient();
  if (!bq) return null;

  const DATASET_ID = 'heat_ranking';

  try {
    // 1. Get Latest Ranking Date AND the Date before it
    const [dateRows] = await bq.query(`
      SELECT DISTINCT date as d FROM \`${DATASET_ID}.rank_history\` 
      WHERE type = 'DAILY' 
        AND date != '2026-04-05' -- Skip corrupted data date
      ORDER BY date DESC LIMIT 2
    `);
    if (dateRows.length === 0 || !dateRows[0].d) return null;
    
    const latestDate = dateRows[0].d.value;
    // Standardize: if we don't have a second date, we use latestDate (which will result in NEW ENTRY for all)
    const baseDate = dateRows.length > 1 ? dateRows[1].d.value : latestDate;

    console.log(`Site Fetch [DAILY]: Latest=${latestDate}, Base=${baseDate}`);

    // 2. Fetch Top 40 Ranking (deduplicated by rank)
    const rankingQuery = `
      SELECT 
        r.rank, r.heatScore, r.videoId,
        s.artist, s.title, s.publishedAt,
        snap.views as totalV,
        prev_snap.views as prevV,
        prev_rank.rank as prevRank
      FROM \`${DATASET_ID}.rank_history\` r
      JOIN \`${DATASET_ID}.songs_master\` s ON r.videoId = s.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` snap ON r.videoId = snap.videoId AND snap.date = r.date
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev_snap ON r.videoId = prev_snap.videoId AND prev_snap.date = DATE '${baseDate}'
      LEFT JOIN \`${DATASET_ID}.rank_history\` prev_rank ON r.videoId = prev_rank.videoId AND prev_rank.date = DATE '${baseDate}' AND prev_rank.type = 'DAILY'
      WHERE r.date = '${latestDate}' AND r.type = 'DAILY'
      QUALIFY ROW_NUMBER() OVER(PARTITION BY r.rank ORDER BY r.heatScore DESC) = 1
      ORDER BY r.rank ASC
      LIMIT 40
    `;
    const [rankingRows] = await bq.query(rankingQuery);

    // 3. Fetch Weekly Volume Trend (10 weeks) AND Growth Calculation in SQL
    const trendQuery = `
      WITH daily_stats AS (
        SELECT 
          date,
          videoId,
          views,
          LAG(views) OVER(PARTITION BY videoId ORDER BY date) as prev_views
        FROM \`${DATASET_ID}.snapshots\`
        WHERE date >= DATE_SUB(DATE '${latestDate}', INTERVAL 71 DAY)
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
      ),
      weekly_agg AS (
        SELECT 
          FLOOR(DATE_DIFF(DATE '${latestDate}', date, DAY) / 7) as week_index,
          SUM(total_dv) as weekly_volume
        FROM daily_increase
        WHERE date <= DATE '${latestDate}'
          AND date > DATE_SUB(DATE '${latestDate}', INTERVAL 70 DAY)
        GROUP BY week_index
      )
      SELECT 
        wa.weekly_volume, wa.week_index,
        gs.this_week, gs.last_week
      FROM weekly_agg wa, growth_stats gs
      WHERE wa.week_index < 10
      ORDER BY wa.week_index DESC
    `;
    const [trendRows] = await bq.query(trendQuery);

    // 4. Global Stats
    const [countRows] = await bq.query(`
      SELECT 
        (SELECT COUNT(DISTINCT artist) FROM \`${DATASET_ID}.songs_master\`) as totalArtists,
        (SELECT COUNT(*) FROM \`${DATASET_ID}.songs_master\`) as totalSongs
    `);

    // 5. Format Response
    const trendValues = trendRows.map(r => r.weekly_volume);
    
    // 6. Fetch Rank History for Top 40 (for Sparklines)
    const videoIds = rankingRows.map(r => r.videoId);
    const historyMap = new Map<string, number[]>();
    
    if (videoIds.length > 0) {
      const historyQuery = `
        SELECT videoId, rank, date
        FROM \`${DATASET_ID}.rank_history\`
        WHERE videoId IN UNNEST(${JSON.stringify(videoIds)})
          AND date >= DATE_SUB(DATE '${latestDate}', INTERVAL 14 DAY)
          AND type = 'DAILY'
        ORDER BY date ASC
      `;
      const [historyRows] = await bq.query(historyQuery);
      historyRows.forEach(h => {
        if (!historyMap.has(h.videoId)) historyMap.set(h.videoId, []);
        historyMap.get(h.videoId)?.push(h.rank);
      });
    }
    
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
        history: historyMap.get(r.videoId) || [],
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

export async function getArtistArchive(artistName: string): Promise<any[]> {
  const bq = getBigQueryClient();
  if (!bq) return [];

  const DATASET_ID = 'heat_ranking';
  const query = `
    SELECT videoId, title, artist, publishedAt
    FROM \`${DATASET_ID}.songs_master\`
    WHERE artist = @artistName
    ORDER BY publishedAt DESC
  `;

  try {
    const [rows] = await bq.query({
      query,
      params: { artistName },
    });
    return rows.map(r => ({
      ...r,
      publishedAt: r.publishedAt?.value || r.publishedAt
    }));
  } catch (error) {
    console.error(`Archive Fetch Error for ${artistName}:`, error);
    return [];
  }
}
export async function getArtistMetadata(artistName: string): Promise<any | null> {
  const bq = getBigQueryClient();
  if (!bq) return null;

  const DATASET_ID = 'heat_ranking';
  const query = `
    SELECT 
      name, bio, genres, links, artistInfo, productionName, subscribers, facebook
    FROM \`${DATASET_ID}.artists_master\`
    WHERE name = @artistName 
       OR @artistName LIKE CONCAT('%', name, '%')
    LIMIT 1
  `;

  try {
    const [rows] = await bq.query({
      query,
      params: { artistName },
    });
    return rows[0] || null;
  } catch (error) {
    console.error(`Metadata Fetch Error for ${artistName}:`, error);
    return null;
  }
}
