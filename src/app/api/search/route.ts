import { NextResponse } from 'next/server';
import { getBigQueryClient, generateEmbedding } from '@/lib/bigquery';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // 1. Generate Embedding for the search term
    const embedding = await generateEmbedding(query);
    if (!embedding) {
      throw new Error("Failed to generate embedding for search query");
    }

    const bq = getBigQueryClient();
    if (!bq) {
      throw new Error("BigQuery client not initialized");
    }

    const PROJECT_ID = process.env.GCP_PROJECT_ID;

    // 2. Perform Vector Search in BigQuery using Cosine Similarity
    // Note: We use a parameterized query for the embedding array
    const sql = `
      WITH similarity_search AS (
        SELECT 
          videoId,
          (1 - ML.DISTANCE(vector, @query_vector, 'COSINE')) as similarity
        FROM \`${PROJECT_ID}.heat_ranking.songs_vector\`
      )
      SELECT 
        m.videoId,
        m.artist,
        m.title,
        m.publishedAt,
        s.similarity,
        h.rank as currentRank
      FROM similarity_search s
      JOIN \`${PROJECT_ID}.heat_ranking.songs_master\` m ON s.videoId = m.videoId
      LEFT JOIN (
        SELECT videoId, rank, ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY date DESC) as rn 
        FROM \`${PROJECT_ID}.heat_ranking.rank_history\` 
        WHERE type = 'DAILY'
      ) h ON s.videoId = h.videoId AND h.rn = 1
      WHERE s.similarity > 0.1
      ORDER BY s.similarity DESC
      LIMIT 20
    `;

    const options = {
      query: sql,
      params: { query_vector: embedding },
      types: { query_vector: ['FLOAT64'] }
    };

    const [rows] = await bq.query(options);

    // 3. Format results for the frontend (consistent with RankingResponse type)
    const results = rows.map(row => ({
      videoId: row.videoId,
      artist: row.artist,
      title: row.title,
      views: 0, // Placeholder as search results might not have latest daily views
      heatScore: 0,
      growth: 0,
      engagement: 0,
      rank: row.currentRank || null,
      thumbnail: `https://img.youtube.com/vi/${row.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${row.videoId}`,
      similarity: row.similarity,
      publishedAt: row.publishedAt?.value || row.publishedAt
    }));

    return NextResponse.json({ 
        results,
        query_type: 'semantic'
    });

  } catch (error: any) {
    console.error("AI Search Error:", error);
    return NextResponse.json({ 
      error: "Search failed", 
      message: error.message 
    }, { status: 500 });
  }
}
