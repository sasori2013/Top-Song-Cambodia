import { getRankingDataFromBQ } from '@/lib/bigquery';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getRankingDataFromBQ();
    if (!data) {
      return NextResponse.json({ error: 'Failed to fetch ranking data' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
