import { google } from 'googleapis';

const AM_SHEET = 'AM_RANKING';
const SP_SHEET = 'SP_RANKING';
const HISTORY_SHEET = 'PLATFORM_HISTORY';

const RANKING_HEADERS = [
  'Rank', 'Title', 'Artist', 'URL', 'Artwork', 'Album', 'Genre', 'Date', 'YouTube VideoID',
];
const HISTORY_HEADERS = [
  'Date', 'Platform', 'Rank', 'Title', 'Artist', 'URL', 'YouTube VideoID',
];

// Yellow-orange for unlinked rows
const COLOR_UNLINKED = { red: 1.0, green: 0.93, blue: 0.55 };
const COLOR_DEFAULT  = { red: 1.0, green: 1.0,  blue: 1.0  };

async function getSheets() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Returns numeric sheetId for the tab
async function ensureSheet(sheets, spreadsheetId, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const found = meta.data.sheets.find(s => s.properties.title === title);
  if (found) return found.properties.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  const sheetId = res.data.replies[0].addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
  console.log(`[Sheets] Created tab: ${title}`);
  return sheetId;
}

function toRankingRows(songs) {
  return songs.map(s => [
    s.rank,
    s.title,
    s.artist,
    s.url || '',
    s.artwork_url || '',
    s.album || '',
    s.genre || '',
    s.date,
    s.youtube_video_id || '',
  ]);
}

// Highlight rows: yellow-orange = no YouTube link, white = linked
async function applyHighlighting(sheets, spreadsheetId, sheetId, songs) {
  if (!songs?.length) return;

  const COL_COUNT = RANKING_HEADERS.length;

  const requests = songs.map((song, i) => {
    const rowIndex = i + 1; // 0=header, 1+ = data
    const color = song.youtube_video_id ? COLOR_DEFAULT : COLOR_UNLINKED;
    return {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: COL_COUNT,
        },
        rows: [{
          values: Array(COL_COUNT).fill(null).map(() => ({
            userEnteredFormat: { backgroundColor: color },
          })),
        }],
        fields: 'userEnteredFormat.backgroundColor',
      },
    };
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

async function overwriteRankingSheet(sheets, spreadsheetId, tabName, sheetId, songs) {
  if (!songs?.length) return;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tabName}'!A2:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: toRankingRows(songs) },
  });

  await applyHighlighting(sheets, spreadsheetId, sheetId, songs);

  const unlinked = songs.filter(s => !s.youtube_video_id).length;
  console.log(`[Sheets] ${tabName}: wrote ${songs.length} rows (${unlinked} unlinked, highlighted)`);
}

export async function writeToSheets({ appleMusic, spotify }) {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
  const today = new Date().toISOString().split('T')[0];

  const sheets = await getSheets();

  const amSheetId = await ensureSheet(sheets, SHEET_ID, AM_SHEET, RANKING_HEADERS);
  const spSheetId = await ensureSheet(sheets, SHEET_ID, SP_SHEET, RANKING_HEADERS);
  await ensureSheet(sheets, SHEET_ID, HISTORY_SHEET, HISTORY_HEADERS);

  await overwriteRankingSheet(sheets, SHEET_ID, AM_SHEET, amSheetId, appleMusic);
  await overwriteRankingSheet(sheets, SHEET_ID, SP_SHEET, spSheetId, spotify);

  // Append to history
  const historyRows = [
    ...(appleMusic || []).map(s => [today, 'apple_music', s.rank, s.title, s.artist, s.url || '', s.youtube_video_id || '']),
    ...(spotify || []).map(s => [today, 'spotify', s.rank, s.title, s.artist, s.url || '', s.youtube_video_id || '']),
  ];

  if (historyRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${HISTORY_SHEET}'!A:G`,
      valueInputOption: 'RAW',
      requestBody: { values: historyRows },
    });
    console.log(`[Sheets] PLATFORM_HISTORY: appended ${historyRows.length} rows`);
  }
}
