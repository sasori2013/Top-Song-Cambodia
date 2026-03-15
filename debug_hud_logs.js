const { google } = require('googleapis');
const path = require('path');

async function debugFilter() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'DEBUG_LOG!A:B',
  });

  const allRows = res.data.values || [];
  console.log(`Total rows: ${allRows.length}`);

  const nowLocal = new Date();
  const todayStr = nowLocal.toLocaleDateString('en-CA');
  const yesterday = new Date(nowLocal);
  yesterday.setDate(nowLocal.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA');

  console.log(`Filtering for: Today=${todayStr}, Yesterday=${yesterdayStr}`);
  console.log(`Current Time: ${nowLocal.toString()}`);

  const startIndex = Math.max(1, allRows.length - 300);
  const matches = [];

  for (let i = allRows.length - 1; i >= startIndex; i--) {
      const row = allRows[i];
      if (!row || row.length < 2) continue;

      const timestampStr = row[0] ? row[0].toString().trim() : '';
      const message = row[1] ? row[1].toString().trim() : '';
      
      let logDate = new Date();
      if (timestampStr) {
        const parsed = new Date(timestampStr);
        if (!isNaN(parsed.getTime())) {
          logDate = parsed;
        }
      }

      const logDayStr = logDate.toLocaleDateString('en-CA');
      
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

      if (i > allRows.length - 10) {
          console.log(`Row ${i} | Date: ${logDayStr} | Important: ${isImportant} | Msg: ${message.substring(0, 50)}`);
      }

      if (logDayStr !== todayStr && logDayStr !== yesterdayStr) {
        // console.log(`Stopping at row ${i} because ${logDayStr} is not today/yesterday`);
        // break; 
      }

      if (isImportant) {
          matches.push({ i, message });
      }
  }

  console.log(`Total matches found: ${matches.length}`);
}

debugFilter();
