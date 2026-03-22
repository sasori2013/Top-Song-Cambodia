import { NextResponse } from 'next/server';
import { getSheetData, getSpreadsheetMetadata } from '@/lib/sheets';

export async function GET() {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    const gasUrl = process.env.NEXT_PUBLIC_GAS_API_URL;
    if (!gasUrl) {
        throw new Error('NEXT_PUBLIC_GAS_API_URL is not defined');
    }

    const response = await fetch(`${gasUrl}?action=stats`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`GAS API error! status: ${response.status}`);
    }
    const data = await response.json();
    const stats = data.stats || { totalArtists: 0, totalProductions: 0, totalSongs: 0, newSongs: 0 };

    return NextResponse.json({
      totalProduction: stats.totalProductions,
      totalArtist: stats.totalArtists,
      totalTracks: stats.totalSongs,
      totalEntries: stats.totalProductions + stats.totalArtists,
      increases: {
        production: Math.floor(stats.totalProductions * 0.01) || 0, // Fallback placeholder if GAS doesn't provide specific increase
        artist: Math.floor(stats.totalArtists * 0.01) || 0,
        tracks: stats.newSongs || 0,
        expiredTracks: 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching data from GAS:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to fetch data' }, { status: 500 });
  }
}
