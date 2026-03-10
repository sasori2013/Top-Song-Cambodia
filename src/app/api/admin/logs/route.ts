import { NextResponse } from 'next/server';
import { getSheetData, getSpreadsheetMetadata } from '@/lib/sheets';
import { NotificationItem } from '@/components/admin/HUDGraphics';

export async function GET() {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    // Check if DEBUG_LOG sheet exists
    const metadata = await getSpreadsheetMetadata(sheetId);
    const debugLogSheet = metadata.sheets?.find(s => s.properties?.title === 'DEBUG_LOG');
    
    if (!debugLogSheet) {
      return NextResponse.json({ logs: [] });
    }

    // Fetch the last 50 rows to find recent telegram notifications
    // We fetch a bit more because there's a lot of noise (e.g. "Batch 1 call...")
    // In Google Sheets API, specifying just the sheet name fetches the whole sheet, but we can't easily fetch JUST the last N rows without knowing total rows.
    // So we fetch columns A and B, which shouldn't be too heavy.
    const allRows = await getSheetData(sheetId, `'DEBUG_LOG'!A:B`);
    
    if (!allRows || allRows.length < 2) {
      return NextResponse.json({ logs: [] });
    }

    // Process from the bottom (newest) to top
    const recentLogs: NotificationItem[] = [];
    const MAX_LOGS_TO_RETURN = 20;

    // Get "today" in UTC+7 (Phnom Penh) or just server Local
    const nowLocal = new Date();
    // Simple date string for comparison "YYYY-MM-DD"
    const todayStr = nowLocal.toLocaleDateString('en-CA'); // 'en-CA' gives YYYY-MM-DD

    for (let i = allRows.length - 1; i >= 1; i--) {
      const row = allRows[i];
      if (!row || row.length < 2) continue;

      const timestampStr = row[0] ? row[0].toString().trim() : '';
      const message = row[1] ? row[1].toString().trim() : '';
      
      if (!message) continue;

      // Date filtering: Only keep today's logs
      let logDate = new Date();
      if (timestampStr) {
        const parsed = new Date(timestampStr);
        if (!isNaN(parsed.getTime())) {
          logDate = parsed;
        }
      }

      const logDayStr = logDate.toLocaleDateString('en-CA');
      if (logDayStr !== todayStr) {
        // Since we process from newest to oldest, once we hit a different day, we can stop
        // unless the spreadsheet is out of order (unlikely for a log)
        break; 
      }

      // Filter: We ONLY want messages that are meant for Telegram (they start with emojis usually)
      // Main.js sends: ✅, ❌, ⚠️, 🏐, etc.
      // We also look for specific system messages you might want to see.
      let type: 'info' | 'success' | 'error' | 'warning' | 'expired' = 'info';
      
      const isImportant = 
        message.includes('✅') || 
        message.includes('❌') || 
        message.includes('⚠️') || 
        message.includes('🏐') ||
        message.includes('📊') ||
        message.includes('🚀') ||
        message.includes('【実行】') ||
        message.includes('【完了】') ||
        message.includes('【成功】') ||
        message.includes('FB_POST') ||
        message.includes('TRACK_ADD') ||
        message.includes('TRACK_EXPIRED') ||
        message.includes('SYNC') ||
        message.includes('System check') ||
        message.includes('DATABASE');

      if (!isImportant) {
        continue;
      }

      if (message.includes('❌') || message.includes('エラー') || message.includes('FAILURE')) {
        type = 'error';
      } else if (message.includes('✅') || message.includes('成功') || message.includes('TRACK_ADD') || message.includes('【完了】')) {
        type = 'success';
      } else if (message.includes('⚠️') || message.includes('警告') || message.includes('WARNING')) {
        type = 'warning';
      } else if (message.includes('TRACK_EXPIRED')) {
        type = 'expired';
      } else if (message.includes('【実行】') || message.includes('SYNC') || message.includes('🚀')) {
        type = 'info';
      }

      // Clean up the message (remove the prefixes and emojis to make it fit better on the HUD)
      let cleanMessage = message
        .replace(/[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
        .replace('【完了】', '')
        .replace('【成功】', '')
        .replace('【エラー】', '')
        .replace('【テスト】', 'TEST:')
        .trim();

      // Only take the first few lines if it's very long
      const lines = cleanMessage.split('\n');
      if (lines.length > 2) {
        cleanMessage = lines[0] + ' ' + (lines[1] || '').substring(0, 50) + '...';
      }

      let timestamp = new Date();
      if (timestampStr) {
        const parsed = new Date(timestampStr);
        if (!isNaN(parsed.getTime())) {
          timestamp = parsed;
        }
      }

      const hash = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 9);

      recentLogs.push({
        id: `log-${i}-${hash}`,
        type,
        message: cleanMessage,
        timestamp
      });

      if (recentLogs.length >= MAX_LOGS_TO_RETURN) {
        break;
      }
    }

    return NextResponse.json({ logs: recentLogs });

  } catch (error: any) {
    console.error('Error fetching Google Sheets logs:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to fetch logs' }, { status: 500 });
  }
}
