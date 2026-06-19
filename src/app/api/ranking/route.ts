import { getCachedBQData } from '@/lib/api';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await getCachedBQData();
    if (!data) {
      return NextResponse.json({ error: 'Failed to fetch ranking data' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
