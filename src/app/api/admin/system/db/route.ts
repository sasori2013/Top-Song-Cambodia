import { NextResponse } from 'next/server';
import { getBigQueryClient } from '@/lib/bigquery';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bq = getBigQueryClient();
  if (!bq) {
    return NextResponse.json({ 
      error: 'BigQuery client not initialized',
      tables: [] 
    }, { status: 500 });
  }

  // Use the resolved projectId from the BQ client itself
  const projectId = bq.projectId;
  const DATASET_ID = 'heat_ranking';

  const query = `
    SELECT 
      table_id as tableId, 
      row_count as rowCount, 
      TIMESTAMP_MILLIS(last_modified_time) as lastModifiedTime,
      size_bytes as sizeBytes
    FROM \`${projectId}.${DATASET_ID}.__TABLES__\`
    WHERE table_id IN ('snapshots', 'rank_history', 'songs_master', 'songs_vector', 'artists_master', 'label_roster')
  `;

  try {
    const [rows] = await bq.query({ query });
    
    // Map rows to easily readable output structure
    const tablesInfo = rows.map((r: any) => ({
      tableId: r.tableId,
      rowCount: Number(r.rowCount || 0),
      sizeBytes: Number(r.sizeBytes || 0),
      lastModified: r.lastModifiedTime?.value || r.lastModifiedTime,
    }));

    return NextResponse.json({ 
      projectId,
      datasetId: DATASET_ID,
      tables: tablesInfo 
    });
  } catch (error: any) {
    console.error('Error fetching BigQuery tables metadata:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch BigQuery metadata',
      tables: [] 
    }, { status: 500 });
  }
}
