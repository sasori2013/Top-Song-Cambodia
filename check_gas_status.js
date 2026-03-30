const { google } = require('googleapis');
const fs = require('fs');

async function checkStatus() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';

  try {
    // Check DEBUG_LOG
    const logRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DEBUG_LOG!A:B',
    });
    const logRows = logRes.data.values || [];
    console.log('\n--- DEBUG_LOG (Last 20) ---');
    logRows.slice(-20).forEach(row => console.log(`${row[0]} | ${row[1]}`));

    // Check SYS_USAGE
    const usageRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SYS_USAGE!A:E',
    });
    const usageRows = usageRes.data.values || [];
    console.log('\n--- SYS_USAGE ---');
    usageRows.forEach(row => console.log(row.join(' | ')));

    // Check RANKING_DAILY first date
    const rankRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RANKING_DAILY!A1:B2',
    });
    const rankRows = rankRes.data.values || [];
    if (rankRows.length > 1) {
      console.log('\nLatest RANKING_DAILY date:', rankRows[1][0]);
    }

  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

checkStatus();
