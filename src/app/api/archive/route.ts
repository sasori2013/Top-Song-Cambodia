import { getArtistArchive } from '@/lib/bigquery';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist');

  if (!artist) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  try {
    const data = await getArtistArchive(artist);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Archive API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
