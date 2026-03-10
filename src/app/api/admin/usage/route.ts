import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/sheets';

export async function GET() {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    // We expect a sheet named 'SYS_USAGE' with these metrics.
    // If not found, we'll return mock data for initial UI verification.
    try {
      const rows = await getSheetData(sheetId, "'SYS_USAGE'!A:D");
      
      if (rows && rows.length > 1) {
        // Parse actual data from sheet
        // Row 1: YouTube, Row 2: Gemini
        const ytData = rows.find(r => r[0] === 'YouTube');
        const geminiData = rows.find(r => r[0] === 'Gemini');
        
        return NextResponse.json({
          youtube: {
            current: parseInt(ytData?.[1] || '0'),
            max: parseInt(ytData?.[2] || '10000'),
            percentage: (parseInt(ytData?.[1] || '0') / parseInt(ytData?.[2] || '10000')) * 100
          },
          gemini: {
            current: parseInt(geminiData?.[1] || '0'),
            max: parseInt(geminiData?.[2] || '10000'), // Or daily limits
            tokenCount: parseInt(geminiData?.[3] || '0'),
            percentage: (parseInt(geminiData?.[1] || '0') / parseInt(geminiData?.[2] || '10000')) * 100
          }
        });
      }
    } catch (e) {
      // Sheet might not exist yet, return simulation
      console.log("SYS_USAGE sheet not found, returning simulation.");
    }

    // Default simulation data
    return NextResponse.json({
      youtube: {
        current: 7420,
        max: 10000,
        percentage: 74.2
      },
      gemini: {
        current: 428,
        max: 1000,
        tokenCount: 284012,
        percentage: 42.8
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch usage' }, { status: 500 });
  }
}
