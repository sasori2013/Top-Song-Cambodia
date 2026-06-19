import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'songs_master';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const sheetsAuth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

const VIDEO_IDS = [
  'Y7P1GbDEUDA', // JUVIE - Juvie Beverly (non-Khmer, BLOCKLIST)
];

const DRY_RUN = !process.argv.includes('--delete');

async function main() {
  console.log(`\n=== delete-videos (${DRY_RUN ? 'DRY RUN' : 'DELETE'}) ===`);
  console.log(`Target: ${VIDEO_IDS.length} videos\n`);

  // 1. Verify videos exist in BigQuery
  const [rows] = await bq.query({
    query: `SELECT videoId, title, artist FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` WHERE videoId IN UNNEST(@ids)`,
    params: { ids: VIDEO_IDS },
  });

  console.log(`[BQ] Found ${rows.length}/${VIDEO_IDS.length} videos in songs_master:`);
  rows.forEach(r => console.log(`  - [${r.artist}] ${r.title} (${r.videoId})`));

  const notFound = VIDEO_IDS.filter(id => !rows.find(r => r.videoId === id));
  if (notFound.length) console.log(`  [WARN] Not found: ${notFound.join(', ')}`);

  if (DRY_RUN) {
    // BQ counts
    for (const table of ['songs_master', 'snapshots', 'rank_history']) {
      const [cnt] = await bq.query({
        query: `SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET_ID}.${table}\` WHERE videoId IN UNNEST(@ids)`,
        params: { ids: VIDEO_IDS },
      });
      console.log(`[BQ] ${table}: ${Number(cnt[0].cnt)} rows to delete`);
    }
    // Sheets check
    for (const sheetName of ['SONGS', 'SONGS_LONG']) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A:A` });
      const sheetRows = res.data.values || [];
      const hits = sheetRows.slice(1).filter(r => VIDEO_IDS.includes((r[0] || '').trim()));
      console.log(`[Sheets] ${sheetName}: ${hits.length} rows to delete`);
    }
    console.log('\n[DRY RUN] No changes made. Run with --delete to proceed.');
    return;
  }

  // 2. Delete from BigQuery (all tables)
  const BQ_TABLES = ['songs_master', 'snapshots', 'rank_history'];
  for (const table of BQ_TABLES) {
    console.log(`\n[BQ] Deleting from ${table}...`);
    const [job] = await bq.createQueryJob({
      query: `DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.${table}\` WHERE videoId IN UNNEST(@ids)`,
      params: { ids: VIDEO_IDS },
    });
    await job.getQueryResults();
    const [after] = await bq.query({
      query: `SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET_ID}.${table}\` WHERE videoId IN UNNEST(@ids)`,
      params: { ids: VIDEO_IDS },
    });
    const remaining = Number(after[0].cnt);
    console.log(`  Done. Remaining: ${remaining} (expected 0)`);
    if (remaining > 0) throw new Error(`BQ delete failed on ${table} — aborting`);
  }

  // 3. Delete from Sheets
  for (const sheetName of ['SONGS', 'SONGS_LONG']) {
    console.log(`\n[Sheets] Processing ${sheetName}...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheetName}!A:A` });
    const sheetRows = res.data.values || [];
    const toDelete = [];
    for (let i = 1; i < sheetRows.length; i++) {
      if (VIDEO_IDS.includes((sheetRows[i][0] || '').trim())) toDelete.push(i);
    }

    if (toDelete.length === 0) {
      console.log(`  No matching rows.`);
      continue;
    }

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetMeta = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheetMeta) { console.log(`  Sheet not found.`); continue; }
    const sheetGid = sheetMeta.properties.sheetId;

    const requests = toDelete.sort((a, b) => b - a).map(idx => ({
      deleteDimension: { range: { sheetId: sheetGid, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } }
    }));

    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
    console.log(`  Deleted ${toDelete.length} rows from ${sheetName}.`);
  }

  console.log('\n=== All done ===');
}

main().catch(console.error);
