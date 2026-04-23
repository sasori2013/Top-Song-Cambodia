import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.NEXT_PUBLIC_SHEET_ID;

const PRODUCTION_LABELS = [
  'RHM', 'Town', 'Town Full', 'Sunday', 'Sunday Full', 
  'Galaxy', 'Ream', 'We Production', 'Diamond', 'Gold', 'Phleng'
];

async function highlightAnomalies() {
  console.log('Fetching sheet data...');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SONGS!A1:H1000', // Adjusted range up to H to see label
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return;

  const requests = [];
  
  // First, clear all backgrounds to starting clean (optional, but good for refresh)
  requests.push({
    repeatCell: {
      range: { sheetId: 0, startRowIndex: 1, endRowIndex: rows.length, startColumnIndex: 0, endColumnIndex: 8 },
      cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } },
      fields: 'userEnteredFormat.backgroundColor',
    }
  });

  console.log('Analyzing rows for anomalies...');
  for (let i = 1; i < rows.length; i++) {
    const artist = (rows[i][1] || '').trim();
    const label = (rows[i][7] || '').trim();
    
    let needsHighlight = false;
    
    // Condition 1: Artist is empty
    if (!artist) {
      needsHighlight = true;
    } 
    // Condition 2: Artist is exactly a production label name
    else if (PRODUCTION_LABELS.some(pl => artist.toLowerCase() === pl.toLowerCase())) {
      needsHighlight = true;
    }
    // Condition 3: Artist is same as Label (and Label is a production)
    else if (artist === label && PRODUCTION_LABELS.some(pl => label.toLowerCase().includes(pl.toLowerCase()))) {
      needsHighlight = true;
    }

    if (needsHighlight) {
      requests.push({
        repeatCell: {
          range: { sheetId: 0, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1.0, green: 0.85, blue: 0.85 } // Light Red
            }
          },
          fields: 'userEnteredFormat.backgroundColor',
        }
      });
    }
  }

  if (requests.length > 1) {
    console.log(`Applying ${requests.length - 1} highlights...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests },
    });
    console.log('Highlighting complete.');
  } else {
    console.log('No anomalies found.');
  }
}

highlightAnomalies().catch(console.error);
