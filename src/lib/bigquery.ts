import { BigQuery } from '@google-cloud/bigquery';
import { RankingResponse, RankingItem } from './types';
import { google } from 'googleapis';

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

const PROVINCE_NAME_TO_ID: Record<string, string> = {
  "Banteay Meanchey": "banteay_meanchey",
  "Battambang": "battambang",
  "Kampong Cham": "kampong_cham",
  "Kampong Chhnang": "kampong_chhnang",
  "Kampong Speu": "kampong_speu",
  "Kampong Thom": "kampong_thom",
  "Kampot": "kampot",
  "Kandal": "kandal",
  "Koh Kong": "koh_kong",
  "Kratie": "kratie",
  "Mondulkiri": "mondulkiri",
  "Phnom Penh": "phnom_penh",
  "Preah Vihear": "preah_vihear",
  "Prey Veng": "prey_veng",
  "Pursat": "pursat",
  "Ratanakiri": "ratanakiri",
  "Siem Reap": "siem_reap",
  "Preah Sihanouk": "preah_sihanouk",
  "Stung Treng": "stung_treng",
  "Svay Rieng": "svay_rieng",
  "Takeo": "takeo",
  "Oddar Meanchey": "oddar_meanchey",
  "Kep": "kep",
  "Pailin": "pailin",
  "Tbong Khmum": "tbong_khmum",
};

async function getRegionalDataFromSheet() {
  if (!SHEET_ID) return [];
  
  try {
    const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim();
    const cleanJson = rawJson.replace(/^['"]|['"]$/g, '');
    const credentials = JSON.parse(cleanJson);
    
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: '📊 州別ランキング【最新】!A:ZZ',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 5) return [];

    const regionalData: { id: string; value: number }[] = [];

    // The sheet usually has some metadata rows. 
    // Based on actual output, the data rows start after a few metadata rows.
    // We look for rows where the first column is a known province name.
    for (const row of rows) {
      if (!row || row.length < 3) continue;

      const provinceName = row[0];
      const provinceId = PROVINCE_NAME_TO_ID[provinceName];
      if (!provinceId) continue;

      // Sum all numeric scores in the row (Rank 1 score, Rank 2 score, etc.)
      let totalHeat = 0;
      for (let j = 2; j < row.length; j += 2) {
        const val = parseInt(row[j]);
        if (!isNaN(val)) totalHeat += val;
      }

      regionalData.push({ id: provinceId, value: totalHeat });
    }

    return regionalData;
  } catch (error) {
    console.error('Error fetching regional data from sheet:', error);
    return [];
  }
}

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
    const baseDate = dateRows.length > 1 ? dateRows[1].d.value : latestDate;

    // 1b. Get the most recent complete snapshot date before latestDate (>=400 songs = full run)
    const [prevSnapRows] = await bq.query(`
      SELECT CAST(date AS STRING) as d
      FROM \`${DATASET_ID}.snapshots\`
      WHERE date < DATE '${latestDate}'
      GROUP BY date
      HAVING COUNT(*) >= 400
      ORDER BY date DESC
      LIMIT 1
    `);
    const prevSnapDate = prevSnapRows[0]?.d || baseDate;

    console.log(`Site Fetch [DAILY]: Latest=${latestDate}, Base=${baseDate}, PrevSnap=${prevSnapDate}`);

    // 2. Fetch Top 40 Ranking (deduplicated by rank)
    const rankingQuery = `
      SELECT
        r.rank, r.heatScore, r.videoId,
        s.artist, COALESCE(NULLIF(s.cleanTitle, ''), s.title) as title, s.publishedAt,
        snap.views as totalV, snap.likes as likes, snap.comments as comments,
        prev_snap.views as prevV,
        prev_rank.rank as prevRank
      FROM \`${DATASET_ID}.rank_history\` r
      JOIN \`${DATASET_ID}.songs_master\` s ON r.videoId = s.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` snap ON r.videoId = snap.videoId AND snap.date = r.date
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev_snap ON r.videoId = prev_snap.videoId AND prev_snap.date = DATE '${prevSnapDate}'
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
        (SELECT COUNT(DISTINCT targetArtist) FROM (
          SELECT name AS targetArtist FROM \`${DATASET_ID}.artists_master\` WHERE type = 'Artist'
          UNION DISTINCT
          SELECT targetArtist FROM \`${DATASET_ID}.label_roster\`
          WHERE targetArtist IS NOT NULL AND targetArtist != ''
        )) as totalArtists,
        (SELECT COUNT(*) FROM \`${DATASET_ID}.songs_master\`) as totalSongs
    `);

    // 4b. Daily Actions: incremental views/likes/comments between the two most recent complete snapshots
    const [actionRows] = await bq.query(`
      SELECT
        COALESCE(SUM(CASE WHEN s1.views    > s2.views    THEN s1.views    - s2.views    ELSE 0 END), 0) AS inc_views,
        COALESCE(SUM(CASE WHEN s1.likes    > s2.likes    THEN s1.likes    - s2.likes    ELSE 0 END), 0) AS inc_likes,
        COALESCE(SUM(CASE WHEN s1.comments > s2.comments THEN s1.comments - s2.comments ELSE 0 END), 0) AS inc_comments,
        COALESCE(SUM(s1.views + s1.likes + s1.comments), 0) AS total_actions_volume
      FROM \`${DATASET_ID}.snapshots\` s1
      JOIN \`${DATASET_ID}.snapshots\` s2 ON s1.videoId = s2.videoId
      WHERE CAST(s1.date AS STRING) = '${latestDate}'
        AND CAST(s2.date AS STRING) = '${prevSnapDate}'
    `);
    const dailyActionsToday = {
      views:    Number(actionRows[0]?.inc_views    || 0),
      likes:    Number(actionRows[0]?.inc_likes    || 0),
      comments: Number(actionRows[0]?.inc_comments || 0),
      totalActionsVolume: Number(actionRows[0]?.total_actions_volume || 0),
    };

    // 4c. Previous day actions: diff between prevSnapDate and the snapshot before it
    const [prevPrevSnapRows] = await bq.query(`
      SELECT CAST(date AS STRING) as d
      FROM \`${DATASET_ID}.snapshots\`
      WHERE date < DATE '${prevSnapDate}'
      GROUP BY date HAVING COUNT(*) >= 400
      ORDER BY date DESC LIMIT 1
    `);
    const prevPrevSnapDate = prevPrevSnapRows[0]?.d || null;

    let prevDailyActions = null;
    if (prevPrevSnapDate) {
      const [prevActionRows] = await bq.query(`
        SELECT
          COALESCE(SUM(CASE WHEN s1.views    > s2.views    THEN s1.views    - s2.views    ELSE 0 END), 0) AS inc_views,
          COALESCE(SUM(CASE WHEN s1.likes    > s2.likes    THEN s1.likes    - s2.likes    ELSE 0 END), 0) AS inc_likes,
          COALESCE(SUM(CASE WHEN s1.comments > s2.comments THEN s1.comments - s2.comments ELSE 0 END), 0) AS inc_comments
        FROM \`${DATASET_ID}.snapshots\` s1
        JOIN \`${DATASET_ID}.snapshots\` s2 ON s1.videoId = s2.videoId
        WHERE CAST(s1.date AS STRING) = '${prevSnapDate}'
          AND CAST(s2.date AS STRING) = '${prevPrevSnapDate}'
      `);
      prevDailyActions = {
        views:    Number(prevActionRows[0]?.inc_views    || 0),
        likes:    Number(prevActionRows[0]?.inc_likes    || 0),
        comments: Number(prevActionRows[0]?.inc_comments || 0),
      };
    }

    // Daily comment sentiment (aggregate across ranked songs)
    const [sentimentRows] = await bq.query(`
      SELECT
        ROUND(AVG(sm.sentiment_positive)) AS avg_positive,
        ROUND(AVG(sm.sentiment_negative)) AS avg_negative,
        ROUND(AVG(sm.sentiment_neutral))  AS avg_neutral,
        COUNT(*) AS analyzed_songs
      FROM \`${DATASET_ID}.songs_master\` sm
      WHERE sm.sentiment_positive IS NOT NULL
        AND sm.videoId IN (SELECT DISTINCT videoId FROM \`${DATASET_ID}.rank_history\` WHERE type = 'DAILY')
    `);
    const sentimentRow = sentimentRows[0];
    const sentiment = sentimentRow?.analyzed_songs > 0 ? {
      positive: Number(sentimentRow.avg_positive),
      neutral:  Number(sentimentRow.avg_neutral),
      negative: Number(sentimentRow.avg_negative),
      songs:    Number(sentimentRow.analyzed_songs),
    } : undefined;

    // Daily genre split
    const [dailyGenreRows] = await bq.query(`
      SELECT sm.genre,
        SUM(curr.views - IFNULL(prev.views, 0)) AS daily_views
      FROM \`${DATASET_ID}.snapshots\` curr
      JOIN \`${DATASET_ID}.songs_master\` sm ON curr.videoId = sm.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev
        ON curr.videoId = prev.videoId AND prev.date = DATE_SUB(curr.date, INTERVAL 1 DAY)
      WHERE curr.date = DATE '${latestDate}'
        AND sm.genre IS NOT NULL AND sm.genre != ''
      GROUP BY sm.genre
      ORDER BY daily_views DESC
    `);

    // Daily top songs
    const [dailyTopRows] = await bq.query(`
      SELECT sm.title, sm.artist, sm.genre,
        curr.views - IFNULL(prev.views, 0) AS daily_views,
        curr.likes - IFNULL(prev.likes, 0) AS daily_likes
      FROM \`${DATASET_ID}.snapshots\` curr
      JOIN \`${DATASET_ID}.songs_master\` sm ON curr.videoId = sm.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev
        ON curr.videoId = prev.videoId AND prev.date = DATE_SUB(curr.date, INTERVAL 1 DAY)
      WHERE curr.date = DATE '${latestDate}'
      ORDER BY daily_views DESC
      LIMIT 5
    `);

    const dailyActions = {
      ...dailyActionsToday,
      ...(prevDailyActions ? { prev: prevDailyActions } : {}),
      sentiment,
      genreViews: dailyGenreRows.map((r: any) => ({ genre: r.genre as string, views: Number(r.daily_views) })),
      topSongs: dailyTopRows.map((r: any) => ({
        title: r.title as string,
        artist: r.artist as string,
        genre: r.genre as string ?? undefined,
        views: Number(r.daily_views),
        likes: Number(r.daily_likes),
      })),
    };

    // 5. Release Activity: weekly (past 4 weeks) + monthly (past 12 months)
    const releaseQuery = `
      WITH weekly AS (
        SELECT
          DATE_DIFF(DATE '${latestDate}', DATE_TRUNC(DATE(publishedAt), WEEK(MONDAY)), WEEK) AS periods_ago,
          COUNT(*) AS count,
          'weekly' AS type
        FROM \`${DATASET_ID}.songs_master\`
        WHERE publishedAt IS NOT NULL
          AND DATE(publishedAt) BETWEEN DATE_SUB(DATE '${latestDate}', INTERVAL 4 WEEK) AND DATE '${latestDate}'
        GROUP BY periods_ago
        HAVING periods_ago BETWEEN 0 AND 3
      ),
      monthly AS (
        SELECT
          DATE_DIFF(DATE_TRUNC(DATE '${latestDate}', MONTH), DATE_TRUNC(DATE(publishedAt), MONTH), MONTH) AS periods_ago,
          COUNT(*) AS count,
          'monthly' AS type
        FROM \`${DATASET_ID}.songs_master\`
        WHERE publishedAt IS NOT NULL
          AND DATE(publishedAt) BETWEEN DATE_SUB(DATE '${latestDate}', INTERVAL 12 MONTH) AND DATE '${latestDate}'
        GROUP BY periods_ago
        HAVING periods_ago BETWEEN 0 AND 11
      )
      SELECT * FROM weekly
      UNION ALL
      SELECT * FROM monthly
    `;
    const [releaseRows] = await bq.query(releaseQuery);

    const weeklyMap = new Map(
      releaseRows.filter(r => r.type === 'weekly').map(r => [Number(r.periods_ago), Number(r.count)])
    );
    const monthlyMap = new Map(
      releaseRows.filter(r => r.type === 'monthly').map(r => [Number(r.periods_ago), Number(r.count)])
    );

    const weeklyLabels = ['3W AGO', '2W AGO', 'LAST WK', 'THIS WK'];
    const weeklyActivity = [3, 2, 1, 0].map((ago, i) => ({
      label: weeklyLabels[i],
      count: weeklyMap.get(ago) || 0,
      isCurrent: ago === 0,
    }));

    const latestDateObj = new Date(latestDate);
    const curMonth = latestDateObj.getMonth();
    const curYear = latestDateObj.getFullYear();
    const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthlyActivity = Array.from({ length: 12 }, (_, i) => {
      const ago = 11 - i;
      const d = new Date(curYear, curMonth - ago, 1);
      return {
        label: MONTH_NAMES[d.getMonth()],
        count: monthlyMap.get(ago) || 0,
        isCurrent: ago === 0,
      };
    });

    // 5b. Format Response
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
    
    // 6. Fetch Province Data (Prefer Google Sheet for latest regional heat)
    let regionalData = await getRegionalDataFromSheet();
    
    // Fallback to BigQuery if sheet fetch fails or is empty
    if (regionalData.length === 0) {
      const [provinceRows] = await bq.query(`
        SELECT province_id as id, SUM(score) as value
        FROM \`${DATASET_ID}.trends_score_matrix\`
        WHERE run_date = (SELECT MAX(run_date) FROM \`${DATASET_ID}.trends_score_matrix\`)
        GROUP BY province_id
      `);
      regionalData = provinceRows.map(r => ({ id: r.id, value: Number(r.value || 0) }));
    }
    
    // Growth from SQL results (all rows have same GS values)
    const thisWeekSum = trendRows[0]?.this_week || 0;
    const prevWeekSum = trendRows[0]?.last_week || 0;

    // Scale regionalData to match actual Weekly Total Volume (thisWeekSum)
    const totalScoresSum = regionalData.reduce((acc, curr) => acc + curr.value, 0);
    if (thisWeekSum > 0 && totalScoresSum > 0) {
      const scalingFactor = thisWeekSum / totalScoresSum;
      regionalData = regionalData.map(d => ({
        ...d,
        value: Math.round(d.value * scalingFactor)
      }));
    }
    
    const heatGrowth = prevWeekSum > 0 ? ((thisWeekSum - prevWeekSum) / prevWeekSum) * 100 : 0;
    
    console.log(`Growth Check [${latestDate}]: ThisWeek=${thisWeekSum}, PrevWeek=${prevWeekSum}, Growth=${heatGrowth}%`);

    const ranking = rankingRows.map(r => {
      const dv = Math.max(0, (r.totalV || 0) - (r.prevV || 0));
      const growth = r.prevV ? (dv / r.prevV) * 100 : 0;
      const rankChange = r.prevRank ? r.prevRank - r.rank : 'NEW';
      const engagement = (r.totalV || 0) > 0
        ? ((Number(r.likes || 0) + Number(r.comments || 0)) / r.totalV) * 100
        : 0;

      return {
        rank: r.rank,
        artist: r.artist,
        title: r.title,
        views: r.totalV || 0,
        dailyViews: dv,
        growth: Math.round(growth * 100) / 100,
        engagement: Math.round(engagement * 100) / 100,
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

    // 6. Genre trend: monthly release counts per genre (past 12 months)
    const GENRE_ORDER = ['Pop', 'Hip-hop & Rap', 'R&B & Soul', 'Ballad', 'Traditional Khmer', 'Dance & EDM', 'Rock', 'Other'];
    const [genreRows] = await bq.query(`
      SELECT FORMAT_DATE('%Y-%m', DATE(publishedAt)) AS month, genre, COUNT(*) AS count
      FROM \`${DATASET_ID}.songs_master\`
      WHERE genre IS NOT NULL AND genre != ''
        AND DATE(publishedAt) BETWEEN DATE_SUB(DATE '${latestDate}', INTERVAL 12 MONTH) AND DATE '${latestDate}'
      GROUP BY month, genre
      ORDER BY month ASC
    `);

    const genreMonths: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      genreMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const genreMap: Record<string, Record<string, number>> = {};
    genreRows.forEach((r: any) => {
      if (!genreMap[r.genre]) genreMap[r.genre] = {};
      genreMap[r.genre][r.month] = Number(r.count);
    });
    const genreTrend = {
      months: genreMonths,
      series: GENRE_ORDER
        .map(g => ({ genre: g, values: genreMonths.map(m => genreMap[g]?.[m] || 0) }))
        .filter(s => s.values.some(v => v > 0)),
    };

    // 7. Genre trend: views-weighted (latest snapshot views per video)
    const [genreViewRows] = await bq.query(`
      SELECT FORMAT_DATE('%Y-%m', DATE(sm.publishedAt)) AS month, sm.genre,
        SUM(latest.views) AS count
      FROM \`${DATASET_ID}.songs_master\` sm
      JOIN (
        SELECT videoId, MAX(views) AS views
        FROM \`${DATASET_ID}.snapshots\`
        GROUP BY videoId
      ) latest ON sm.videoId = latest.videoId
      WHERE sm.genre IS NOT NULL AND sm.genre != ''
        AND DATE(sm.publishedAt) BETWEEN DATE_SUB(DATE '${latestDate}', INTERVAL 12 MONTH) AND DATE '${latestDate}'
      GROUP BY month, sm.genre
      ORDER BY month ASC
    `);
    const genreViewMap: Record<string, Record<string, number>> = {};
    genreViewRows.forEach((r: any) => {
      if (!genreViewMap[r.genre]) genreViewMap[r.genre] = {};
      genreViewMap[r.genre][r.month] = Number(r.count);
    });
    const genreTrendViews = {
      months: genreMonths,
      series: GENRE_ORDER
        .map(g => ({ genre: g, values: genreMonths.map(m => genreViewMap[g]?.[m] || 0) }))
        .filter(s => s.values.some(v => v > 0)),
    };

    // 8. Weekly genre view breakdown (incremental views past 7 days)
    const [weeklyGenreRows] = await bq.query(`
      WITH maxdate AS (SELECT MAX(date) AS d FROM \`${DATASET_ID}.snapshots\`)
      SELECT sm.genre,
        SUM(curr.views - IFNULL(prev.views, 0)) AS week_views
      FROM \`${DATASET_ID}.snapshots\` curr
      JOIN \`${DATASET_ID}.songs_master\` sm ON curr.videoId = sm.videoId
      LEFT JOIN \`${DATASET_ID}.snapshots\` prev
        ON curr.videoId = prev.videoId AND prev.date = DATE_SUB(curr.date, INTERVAL 1 DAY)
      WHERE curr.date >= DATE_SUB((SELECT d FROM maxdate), INTERVAL 6 DAY)
        AND sm.genre IS NOT NULL AND sm.genre != ''
      GROUP BY sm.genre
      ORDER BY week_views DESC
    `);
    const weeklyGenreViews = weeklyGenreRows.map((r: any) => ({
      genre: r.genre as string,
      views: Number(r.week_views),
    }));

    return {
      updatedAt: latestDate,
      stats: {
        totalArtists: countRows[0].totalArtists,
        totalProductions: 12,
        totalSongs: countRows[0].totalSongs,
        heatGrowth: Math.round(heatGrowth * 10) / 10,
        heatTrend: trendValues,
        weeklyGenreViews,
        dailyActions
      },
      ranking: ranking,
      regionalData: regionalData,
      releaseActivity: { weekly: weeklyActivity, monthly: monthlyActivity },
      genreTrend,
      genreTrendViews,
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

/**
 * NEW: Fetch Global All-Time Top Songs (Statistical Fact Layer)
 */
export async function getAllTimeTopSongs(limit: number = 10): Promise<any[]> {
  const bq = getBigQueryClient();
  if (!bq) return [];

  const DATASET_ID = 'heat_ranking';
  const query = `
    SELECT 
      s.title, 
      s.artist, 
      v.views, 
      s.category,
      s.publishedAt
    FROM \`${DATASET_ID}.snapshots\` v
    JOIN \`${DATASET_ID}.songs_master\` s ON v.videoId = s.videoId
    WHERE v.date = (SELECT MAX(date) FROM \`${DATASET_ID}.snapshots\`)
    ORDER BY v.views DESC
    LIMIT @limit
  `;

  try {
    const [rows] = await bq.query({
      query,
      params: { limit },
    });
    return rows.map(r => ({
      ...r,
      publishedAt: r.publishedAt?.value || r.publishedAt
    }));
  } catch (error) {
    console.error("All-Time Stats Fetch Error:", error);
    return [];
  }
}
