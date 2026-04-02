import { NextResponse } from 'next/server';
import { getSheetData, getSpreadsheetMetadata, ensureSheetExists } from '@/lib/sheets';
import { NotificationItem } from '@/components/admin/HUDGraphics';

export async function GET() {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    // Check if DEBUG_LOG sheet exists
    const gasUrl = process.env.NEXT_PUBLIC_GAS_API_URL;
    if (!gasUrl) {
      throw new Error('NEXT_PUBLIC_GAS_API_URL is not defined');
    }

    // Fetch logs from GAS
    const response = await fetch(`${gasUrl}?action=logs`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`GAS API error! status: ${response.status}`);
    }
    const data = await response.json();
    const allRows = data.logs || [];
    
    if (allRows.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    // Process from the bottom (newest) to top
    // Limit to the last 300 rows to keep it fast even if the sheet grows
    const recentLogs: NotificationItem[] = [];
    const MAX_LOGS_TO_RETURN = 20;
    const startIndex = Math.max(1, allRows.length - 300); // Skip header at 0

    // Get "today" and "yesterday" in UTC-like comparison
    const nowLocal = new Date();
    
    // Create a simple dismissed IDs filter (local only for now if SS is hard to reach)
    const dismissedIds = new Set<string>();

    for (let i = allRows.length - 1; i >= startIndex; i--) {
      const row = allRows[i];
      if (!row || row.length < 2) continue;

      const timestampStr = row[0] ? row[0].toString().trim() : '';
      const message = row[1] ? row[1].toString().trim() : '';
      
      if (!message) continue;

      // Filter: We ONLY want major system events to keep it simple
      let type: 'info' | 'success' | 'error' | 'warning' | 'expired' = 'info';
      
      const isImportant = 
        message.includes('✅') || 
        message.includes('❌') || 
        message.includes('⚠️') || 
        message.includes('🚀') ||
        message.includes('【完了】') ||
        message.includes('【成功】') ||
        message.includes('FB_POST') ||
        message.includes('TRACK_ADD') ||
        message.includes('SYNC');

      if (!isImportant) continue;

      if (message.includes('❌') || message.includes('エラー')) {
        type = 'error';
      } else if (message.includes('✅') || message.includes('成功') || message.includes('【完了】')) {
        type = 'success';
      } else if (message.includes('⚠️') || message.includes('警告')) {
        type = 'warning';
      }

      // Cleanup message for HUD display
      let cleanMessage = message
        .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
        .replace('【完了】', '')
        .replace('【成功】', '')
        .replace('【エラー】', '')
        .trim();

      // Only first line
      cleanMessage = cleanMessage.split('\n')[0].substring(0, 80);

      let timestamp = new Date();
      if (timestampStr) {
        const parsed = new Date(timestampStr);
        if (!isNaN(parsed.getTime())) timestamp = parsed;
      }

      const contentHash = Buffer.from(message + timestampStr).toString('base64').substring(0, 8);
      const stableId = `log-${i}-${contentHash}`;

      if (dismissedIds.has(stableId)) continue;

      recentLogs.push({
        id: stableId,
        type,
        message: cleanMessage,
        timestamp
      });

      if (recentLogs.length >= 10) break; // Simple: only show last 10
    }

    return NextResponse.json({ logs: recentLogs });

  } catch (error: any) {
    console.error('Error fetching Google Sheets logs:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to fetch logs' }, { status: 500 });
  }
}
