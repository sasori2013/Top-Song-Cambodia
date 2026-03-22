import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const gasUrl = process.env.NEXT_PUBLIC_GAS_API_URL;
    if (!gasUrl) {
      throw new Error('NEXT_PUBLIC_GAS_API_URL is not defined');
    }

    try {
      const response = await fetch(`${gasUrl}?action=sys_usage_stats`, { cache: 'no-store' });
      if (!response.ok) {
          throw new Error(`GAS API error! status: ${response.status}`);
      }
      const data = await response.json();
      const usageRows = data.usage || [];
      
      if (usageRows.length > 0) {
        const ytData = usageRows.find((r: any) => r.service === 'YouTube');
        const geminiData = usageRows.find((r: any) => r.service === 'Gemini');
        
        return NextResponse.json({
          youtube: {
            current: parseInt(ytData?.current || '0'),
            max: parseInt(ytData?.max || '10000'),
            percentage: (parseInt(ytData?.current || '0') / parseInt(ytData?.max || '10000')) * 100
          },
          gemini: {
            current: parseInt(geminiData?.current || '0'),
            max: parseInt(geminiData?.max || '1000'), 
            tokenCount: parseInt(geminiData?.tokenCount || '0'),
            percentage: (parseInt(geminiData?.current || '0') / parseInt(geminiData?.max || '1000')) * 100
          }
        });
      }
    } catch (e) {
      console.log("Failed to fetch usage from GAS, returning simulation.");
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
