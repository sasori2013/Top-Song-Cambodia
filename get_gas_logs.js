const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const claspRcPath = path.join(process.env.HOME, '.clasprc.json');
const claspRc = JSON.parse(fs.readFileSync(claspRcPath, 'utf8'));
const auth = claspRc.tokens.default; // Fixed structure

async function getLogs() {
  const oauth2Client = new google.auth.OAuth2(
    auth.client_id,
    auth.client_secret
  );
  oauth2Client.setCredentials({
    refresh_token: auth.refresh_token,
    access_token: auth.access_token
  });

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const spreadsheetId = '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DEBUG_LOG!A:B',
    });
    const rows = res.data.values || [];
    console.log('--- DEBUG_LOG (Last 20) ---');
    rows.slice(-20).forEach(row => console.log(`${row[0]} | ${row[1]}`));
  } catch (err) {
    console.error('Error fetching logs:', err.message);
  }
}

getLogs();
