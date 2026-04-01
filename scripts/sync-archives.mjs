import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

// All 5 archive spreadsheets
const ARCHIVE_SHEET_IDS = [
  { id: '1rpnfwKECJTO6fH4z9Z5wO_Eluyo4j8iIzjQejgktcoo', label: 'Archive-1' },
  { id: '1UMGshJwLX3aRThs9ehLY123aFa0P33yBdeT-JS5aZu4', label: 'Archive-2' },
  { id: '1OoHHfQ4abz2qLq0ZoaDBvdwpyk30lhiMwExqfxxEALw', label: 'Archive-3' },
  { id: '11WnMARHtYpwEdRJPzg3npI9FhJtbk-EBFjlnKbvX21M', label: 'Archive-4' },
  { id: '1gXplR_TF8w3hn5NZ47g62IFHTWZlll1xXja99HxXa0w', label: 'Archive-5' },
];

// Possible sheet names to try in order
const SNAPSHOT_SHEET_NAMES = ['SNAPSHOT', 'Snapshot', 'snapshot', 'TopKhmerBeats_Snapshot_Archive'];

const toBQDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

async function getSnapshotTabNames(spreadsheetId, label) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabNames = meta.data.sheets.map(s => s.properties.title);
    console.log(`[${label}] Available tabs: ${tabNames.join(', ')}`);
    // Only pick tabs that contain snapshot data
    const snapTabs = tabNames.filter(t => t.includes('_Snap'));
    console.log(`[${label}] Snapshot tabs to sync: ${snapTabs.join(', ') || 'none'}`);
    return snapTabs;
  } catch (err) {
    console.error(`[${label}] Failed to get metadata: ${err.message}`);
    return [];
  }
}

async function getSheetData(spreadsheetId, sheetName, label) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:F`,
    });
    return res.data.values || [];
  } catch (err) {
    console.error(`[${label}] Failed to read tab "${sheetName}": ${err.message}`);
    return [];
  }
}

async function syncArchiveToBQ(archiveInfo) {
  const { id, label } = archiveInfo;
  console.log(`\n====== Syncing ${label} (${id}) ======`);

  const snapTabs = await getSnapshotTabNames(id, label);
  if (snapTabs.length === 0) {
    console.log(`[${label}] No _Snap tabs found. Skipping.`);
    return 0;
  }

  let totalInserted = 0;
  for (const tabName of snapTabs) {
    console.log(`\n  -- Tab: ${tabName} --`);
    // Extract date from tab name e.g. "2026-03-28_Snap" -> "2026-03-28"
    const dateFromTab = tabName.replace('_Snap', '');

    const rows = await getSheetData(id, tabName, label);
    if (rows.length < 2) {
      console.log(`  [${tabName}] No data rows. Skipping.`);
      continue;
    }
    console.log(`  [${tabName}] Sample header: ${JSON.stringify(rows[0])}`);

    const data = rows.slice(1).map(row => {
      // date is either in col A or we use the tab name date
      const rawDate = row[0] ? toBQDate(row[0]) : dateFromTab;
      const videoId = String(row[1] || '').trim();
      if (!rawDate || !videoId) return null;
      return {
        date: rawDate,
        videoId,
        views: parseInt(row[2]) || 0,
        likes: parseInt(row[3]) || 0,
        comments: parseInt(row[4]) || 0,
      };
    }).filter(Boolean);

    if (data.length === 0) {
      console.log(`  [${tabName}] No valid records.`);
      continue;
    }

    console.log(`  [${tabName}] Inserting ${data.length} records...`);
    const CHUNK_SIZE = 500;
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      try {
        await bq.dataset(DATASET_ID).table('snapshots').insert(chunk);
        totalInserted += chunk.length;
        console.log(`  [${tabName}] ${totalInserted} inserted so far...`);
      } catch (err) {
        console.error(`  [${tabName}] Insert error: ${err.message}`);
      }
    }
  }
  return totalInserted;
}

async function main() {
  console.log('=== Archive Sync to BigQuery ===');
  let total = 0;
  for (const archive of ARCHIVE_SHEET_IDS) {
    const count = await syncArchiveToBQ(archive);
    total += count;
  }
  console.log(`\n=== DONE. Total inserted: ${total} rows ===`);
}

main().catch(console.error);
