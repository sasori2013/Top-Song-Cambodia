import { NextResponse } from 'next/server';
import { getSheetData, getSpreadsheetMetadata } from '@/lib/sheets';

export async function GET() {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    const metadata = await getSpreadsheetMetadata(sheetId);
    
    const firstSheetName = metadata.sheets?.[0]?.properties?.title;
    const targetGid = 2074157543;
    const trackSheet = metadata.sheets?.find(s => s.properties?.sheetId === targetGid);
    const trackSheetName = trackSheet ? trackSheet.properties?.title : null;

    if (!firstSheetName) {
        throw new Error('First sheet not found');
    }

    const rows = await getSheetData(sheetId, `'${firstSheetName}'!A:F`);
    let totalProduction = 0;
    let totalArtist = 0;

    if (rows && rows.length > 0) {
      for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || !row[0]) continue;
          
          const colFValue = row[5] ? row[5].toString().toUpperCase().trim() : '';
          
          if (colFValue.includes('P') || colFValue === 'P') {
              totalProduction++;
          } else {
              totalArtist++;
          }
      }
    }

    let totalTracks = 0;
    if (trackSheetName) {
      const trackRows = await getSheetData(sheetId, `'${trackSheetName}'!A:A`);
      if (trackRows && trackRows.length > 1) {
        totalTracks = trackRows.length - 1;
      }
    }

    return NextResponse.json({
      totalProduction,
      totalArtist,
      totalTracks,
      totalEntries: totalProduction + totalArtist
    });

  } catch (error: any) {
    console.error('Error fetching Google Sheets data:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to fetch data' }, { status: 500 });
  }
}
