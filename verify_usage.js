const { google } = require('googleapis');
const path = require('path');

async function verifyReset() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';

  try {
    console.log('--- Verifying current usage ---');
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SYS_USAGE!A:D',
    });
    console.log('Current data:', getRes.data.values);

    // Simulation of resetApiUsage (since we can't easily trigger GAS functions via API directly without Web App URL and proper setup,
    // but we can verify the sheet structure and current values)
    console.log('\n--- Simulation: Resetting YouTube usage to 500 for testing ---');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'SYS_USAGE!B2',
      valueInputOption: 'RAW',
      requestBody: { values: [[500]] }
    });

    const checkRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SYS_USAGE!B2',
    });
    console.log('Updated YouTube usage:', checkRes.data.values[0][0]);
    
    // Note: In real GAS environment, resetApiUsage() will set it to 0.
    // This script just confirms we can write to the sheet and the structure matches.

  } catch (err) {
    console.error('Error:', err.message);
  }
}

verifyReset();
