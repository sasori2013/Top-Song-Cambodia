import { NextResponse } from 'next/server';
import { appendSheetData, ensureSheetExists } from '@/lib/sheets';

export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'Missing log ID' }, { status: 400 });
    }

    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    // Ensure DISMISSED_LOGS sheet exists
    await ensureSheetExists(sheetId, 'DISMISSED_LOGS');

    // Append the dismissed ID to the sheet
    await appendSheetData(sheetId, 'DISMISSED_LOGS!A:A', [[id, new Date().toISOString()]]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error dismissing log:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to dismiss log' }, { status: 500 });
  }
}
