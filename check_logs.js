const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

async function checkLogs() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';

  try {
    console.log('Fetching DEBUG_LOG...');
    const logRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DEBUG_LOG!A:C',
    });

    const logRows = logRes.data.values || [];
    console.log('\n--- Latest DEBUG_LOG (last 20 lines) ---');
    logRows.slice(-20).forEach(row => {
      console.log(`${row[0]} | ${row[1]}`);
    });

    console.log('\nFetching SNAPSHOT dates...');
    const snapRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SNAPSHOT!A1:A',
    });

    const snapRows = snapRes.data.values || [];
    const uniqueDates = [...new Set(snapRows.flat().map(d => d.split(' ')[0]))].sort().slice(-5);
    console.log('\n--- Latest SNAPSHOT dates ---');
    console.log(uniqueDates.join(', '));

    console.log('\nChecking RANKING_DAILY...');
    const rankRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'RANKING_DAILY!A1:A2',
    });
    const rankRows = rankRes.data.values || [];
    if (rankRows.length > 1) {
      console.log('Latest RANKING_DAILY date:', rankRows[1][0]);
    } else {
      console.log('RANKING_DAILY is empty or only has headers.');
    }

    console.log('\nChecking SYS_USAGE...');
    const usageRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SYS_USAGE!A:C',
    });
    const usageRows = usageRes.data.values || [];
    console.log('\n--- SYS_USAGE ---');
    usageRows.forEach(row => {
      console.log(`${row[0]} | ${row[1]} | ${row[2]}`);
    });

  } catch (err) {
    console.error('The API returned an error: ' + err);
  }
}

checkLogs();
