import { revalidateTag, revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

const SECRET = process.env.REVALIDATE_SECRET;

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  if (!SECRET || secret !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidateTag('bq-ranking', 'max');
  revalidatePath('/', 'page');

  console.log('[revalidate] Cache cleared by pipeline webhook');
  return NextResponse.json({ revalidated: true, timestamp: new Date().toISOString() });
}
