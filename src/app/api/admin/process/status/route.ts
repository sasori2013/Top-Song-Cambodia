import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'process_status';

// Credentials Setup
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
let credentials;
try {
  credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
} catch (e) {
  console.error("Failed to parse BigQuery credentials in API:", e);
}

const bq = new BigQuery({
  projectId: PROJECT_ID,
  credentials,
});

export async function GET() {
  const query = `SELECT * FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` WHERE id = 'main_process' LIMIT 1`;

  try {
    const [rows] = await bq.query({ query });
    const status = rows[0];

    if (!status || status.status === 'idle') {
      return NextResponse.json({ status: 'idle' });
    }

    // Progress percentage (BigQuery Integer is returned as Number or String)
    const total = Number(status.total) || 0;
    const progress = Number(status.progress) || 0;
    const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
    const lastUpdate = new Date(status.last_updated_at.value).getTime();

    const result = {
      name: status.name,
      progress,
      total,
      status: status.status,
      percent,
      lastUpdate: status.last_updated_at.value
    };

    // Check if the status is stale (older than 5 minutes)
    if (Date.now() - lastUpdate > 300000 && status.status === 'running') {
      result.status = 'stale';
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("BigQuery Status API Error:", err);
    return NextResponse.json({ 
      status: 'error', 
      message: err.message,
      error_code: err.code 
    });
  }
}

export async function DELETE() {
  const query = `UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` SET status = 'idle' WHERE id = 'main_process'`;
  try {
    await bq.query({ query });
    return NextResponse.json({ status: 'idle' });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message });
  }
}
