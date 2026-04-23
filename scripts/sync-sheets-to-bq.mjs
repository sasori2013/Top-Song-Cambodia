import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['\"]|['\"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

const DATASET_ID = 'heat_ranking';
const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

async function syncLabelRoster() {
  console.log('--- Syncing Label_Roster Sheet to BigQuery ---');

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Label_Roster!A2:C'
  });

  const rows = (res.data.values || [])
    .map(r => ({
      prodName:     (r[0] || '').trim(),
      targetArtist: (r[1] || '').trim(),
      keywords:     (r[2] || '').trim(),
    }))
    .filter(r => r.prodName && r.targetArtist);

  if (rows.length === 0) {
    console.log('No data in Label_Roster sheet.');
    return;
  }

  // Full replace: delete all then insert
  await bq.query(`DELETE FROM \`${DATASET_ID}.label_roster\` WHERE TRUE`);

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const valueSql = chunk.map((_, j) =>
      `SELECT @p${i+j} AS prodName, @t${i+j} AS targetArtist, @k${i+j} AS keywords`
    ).join(' UNION ALL ');
    const params = {};
    chunk.forEach((r, j) => {
      params[`p${i+j}`] = r.prodName;
      params[`t${i+j}`] = r.targetArtist;
      params[`k${i+j}`] = r.keywords;
    });
    await bq.query({
      query: `INSERT INTO \`${DATASET_ID}.label_roster\` (prodName, targetArtist, keywords) ${valueSql}`,
      params
    });
    console.log(`  Inserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  const [cnt] = await bq.query(`SELECT COUNT(DISTINCT targetArtist) as cnt FROM \`${DATASET_ID}.label_roster\``);
  console.log(`Label_Roster synced. Unique targetArtist: ${cnt[0].cnt}`);
}

async function sync() {
  console.log('--- Syncing SONGS Sheet to BigQuery ---');
  
  // 1. Fetch data from Google Sheets
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'SONGS!A:D' // A:videoId, B:artist, C:title, D:cleanTitle
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    console.log('No data found in SONGS sheet.');
    return;
  }

  // Skip header and filter out empty videoIds
  const data = rows.slice(1)
    .map(r => ({
      videoId: r[0],
      artist: r[1],
      title: r[2],
      cleanTitle: r[3]
    }))
    .filter(r => r.videoId && r.artist);

  console.log(`Prepared ${data.length} rows for synchronization.`);

  // 2. Perform Batch Update to BigQuery
  const BATCH_SIZE = 150;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const chunk = data.slice(i, i + BATCH_SIZE);
    
    // Construct MERGE statement
    const valuesSql = chunk.map((_, index) => 
      `SELECT @vId${index} AS vId, @artist${index} AS newArtist, @title${index} AS newTitle, @label${index} AS newLabel, @cleanTitle${index} AS newCleanTitle`
    ).join(' UNION ALL ');

    const params = {};
    chunk.forEach((row, index) => {
      params[`vId${index}`] = row.videoId;
      params[`artist${index}`] = row.artist;
      params[`title${index}`] = row.title;
      params[`label${index}`] = row.label || '';
      params[`cleanTitle${index}`] = row.cleanTitle || '';
    });

    const mergeSql = `
      MERGE \`${DATASET_ID}.songs_master\` T
      USING (${valuesSql}) S
      ON T.videoId = S.vId
      WHEN MATCHED THEN
        UPDATE SET 
          artist = S.newArtist,
          title = S.newTitle,
          label = S.newLabel,
          cleanTitle = S.newCleanTitle,
          classificationSource = 'MANUAL_SHEET_SYNC'
    `;

    try {
      await bq.query({ query: mergeSql, params });
      console.log(`  Synced ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length}`);
    } catch (err) {
      console.error(`Error syncing batch starting at ${i}:`, err.message);
    }
  }

  console.log('--- Sync Completed Successfully ---');
}

async function main() {
  await sync();
  await syncLabelRoster();
}

main().catch(console.error);
