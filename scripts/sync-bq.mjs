import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON is not defined in .env.local');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

// Initialize APIs
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function ensureDatasetAndTables() {
  console.log(`Ensuring dataset ${DATASET_ID} exists...`);
  const dataset = bq.dataset(DATASET_ID);
  const [exists] = await dataset.exists();
  if (!exists) {
    console.log(`Creating dataset ${DATASET_ID}...`);
    await bq.createDataset(DATASET_ID, { location: 'US' });
  }

  const tables = [
    {
      id: 'snapshots',
      schema: 'date:DATE, videoId:STRING, views:INTEGER, likes:INTEGER, comments:INTEGER',
    },
    {
      id: 'rank_history',
      schema: 'date:DATE, videoId:STRING, type:STRING, rank:INTEGER, heatScore:FLOAT',
    },
    {
      id: 'songs_master',
      schema: 'videoId:STRING, artist:STRING, title:STRING, publishedAt:TIMESTAMP',
    },
    {
      id: 'artists_master',
      schema: 'name:STRING, type:STRING',
    }
  ];

  for (const t of tables) {
    console.log(`Checking table ${t.id}...`);
    const table = dataset.table(t.id);
    const [tExists] = await table.exists();
    if (!tExists) {
      console.log(`Creating table ${t.id}...`);
      await table.create({ schema: t.schema });
    }
  }
}

async function syncSheetToBQ(sheetName, tableId, transformFn) {
  console.log(`--- Syncing ${sheetName} to ${tableId} ---`);
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:Z`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log(`No data found in ${sheetName}.`);
      return;
    }

    const headers = rows[0];
    const data = rows.slice(1).map(row => transformFn(row, headers)).filter(Boolean);

    if (data.length === 0) {
      console.log(`No valid records to insert from ${sheetName}.`);
      return;
    }

    console.log(`Inserting ${data.length} rows into ${tableId}...`);
    
    // Chunked insert to avoid payload limits
    const CHUNK_SIZE = 500;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await bq.dataset(DATASET_ID).table(tableId).insert(chunk);
        console.log(`Inserted chunk ${i / CHUNK_SIZE + 1}/${Math.ceil(data.length / CHUNK_SIZE)}`);
    }
    
    console.log(`Successfully synced ${sheetName}!`);
  } catch (err) {
    console.error(`Error syncing ${sheetName}:`, err.message);
  }
}

// Transform helpers
const toBQDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

const toBQTimestamp = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
};

async function runSync() {
  await ensureDatasetAndTables();

  // 1. Sync SNAPSHOT
  await syncSheetToBQ('SNAPSHOT', 'snapshots', (row) => {
    if (!row[1]) return null; // Skip if no videoId
    return {
      date: toBQDate(row[0]),
      videoId: String(row[1]).trim(),
      views: parseInt(row[2]) || 0,
      likes: parseInt(row[3]) || 0,
      comments: parseInt(row[4]) || 0,
    };
  });

  // 2. Sync RANK_HISTORY
  await syncSheetToBQ('RANK_HISTORY', 'rank_history', (row) => {
    if (!row[1]) return null;
    return {
      date: toBQDate(row[0]),
      videoId: String(row[1]).trim(),
      type: String(row[2] || 'Daily'),
      rank: parseInt(row[3]) || 0,
      heatScore: parseFloat(row[4]) || 0,
    };
  });

  // 3. Sync SONGS (Master)
  await syncSheetToBQ('SONGS', 'songs_master', (row) => {
    if (!row[0]) return null;
    return {
      videoId: String(row[0]).trim(),
      artist: String(row[1] || ''),
      title: String(row[2] || ''),
      publishedAt: toBQTimestamp(row[3]),
    };
  });

  // 4. Sync ARTISTS (Knowledge Base)
  await syncSheetToBQ('Artists', 'artists_master', (row) => {
    if (!row[0]) return null;
    const isProduction = String(row[5] || '').trim().toUpperCase() === 'P';
    return {
      name: String(row[0]).trim(),
      type: isProduction ? 'Production' : 'Artist',
    };
  });

  console.log('--- ALL SYNC COMPLETED ---');
}

runSync().catch(console.error);
