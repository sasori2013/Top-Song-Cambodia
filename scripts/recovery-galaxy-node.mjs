import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_SONGS = 'songs_master';

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const youtube = google.youtube({ version: 'v3', auth: new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/youtube.readonly'] }) });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runRecovery() {
  console.log('--- Starting Galaxy Production Name Recovery via Channel ID ---');

  // 1. Load Channel Map from Artists sheet
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:M' });
  const artistRows = resArtists.data.values || [];
  const channelToOfficial = {};
  artistRows.forEach(r => {
    if (r[0] && r[2]) {
      channelToOfficial[r[2]] = r[0]; // channelId -> Official Name
    }
  });

  const sheetsToProcess = [
    { name: 'SONGS', range: 'SONGS!A:B' },
    { name: 'SONGS_LONG', range: 'SONGS_LONG!A:B' }
  ];

  const allUpdates = []; // { sheet, range, name }
  const bqUpdateRows = []; // { videoId, artist }

  for (const sDef of sheetsToProcess) {
    console.log(`Analyzing ${sDef.name} for ruined names...`);
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: sDef.range });
    const rows = res.data.values || [];

    const suspiciousVids = [];
    rows.forEach((row, i) => {
      if (i === 0) return;
      const vidId = row[0];
      const artist = row[1];
      // Target 'Gala' or suspiciously short ruined names
      if (artist === 'Gala' || artist === 'Galaxy' || artist === 'CAM-POP') {
        suspiciousVids.push({ vidId, rowIndex: i + 1 });
      }
    });

    console.log(`Found ${suspiciousVids.length} suspicious rows in ${sDef.name}.`);

    if (suspiciousVids.length === 0) continue;

    // Fetch Channel IDs in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < suspiciousVids.length; i += CHUNK_SIZE) {
      const chunk = suspiciousVids.slice(i, i + CHUNK_SIZE);
      const ids = chunk.map(v => v.vidId).join(',');

      try {
        const resYt = await youtube.videos.list({
          part: ['snippet'],
          id: ids
        });

        const videoItems = resYt.data.items || [];
        const videoToChannel = {};
        videoItems.forEach(item => {
          videoToChannel[item.id] = item.snippet.channelId;
        });

        chunk.forEach(v => {
          const chanId = videoToChannel[v.vidId];
          if (chanId && channelToOfficial[chanId]) {
            const officialName = channelToOfficial[chanId];
            allUpdates.push({
              range: `${sDef.name}!B${v.rowIndex}`,
              values: [[officialName]]
            });
            bqUpdateRows.push({ videoId: v.vidId, artist: officialName });
          }
        });

        console.log(`  Processed ${Math.min(i + CHUNK_SIZE, suspiciousVids.length)} / ${suspiciousVids.length}...`);
      } catch (err) {
        console.error('  Error fetching YouTube metadata:', err.message);
      }
    }
  }

  // 2. Perform Batch Updates to Sheets
  if (allUpdates.length > 0) {
    console.log(`Applying ${allUpdates.length} updates to Sheets...`);
    const UPD_CHUNK = 400;
    for (let i = 0; i < allUpdates.length; i += UPD_CHUNK) {
      const chunk = allUpdates.slice(i, i + UPD_CHUNK);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: chunk }
      });
      console.log(`  Sent Sheet batch ${Math.floor(i/UPD_CHUNK)+1}...`);
      await sleep(1000);
    }
  }

  // 3. Sync to BigQuery
  if (bqUpdateRows.length > 0) {
    console.log(`Syncing ${bqUpdateRows.length} rows to BigQuery...`);
    const tempFile = join(os.tmpdir(), `galaxy_recovery_${Date.now()}.json`);
    fs.writeFileSync(tempFile, bqUpdateRows.map(r => JSON.stringify(r)).join('\n'));

    const tempTableId = `galaxy_recovery_temp_${Date.now()}`;
    await bq.dataset(DATASET_ID).table(tempTableId).load(tempFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      schema: { fields: [
        {name: 'videoId', type: 'STRING'},
        {name: 'artist', type: 'STRING'}
      ]}
    });

    await bq.query(`
      MERGE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_SONGS}\` T
      USING \`${PROJECT_ID}.${DATASET_ID}.${tempTableId}\` S
      ON T.videoId = S.videoId
      WHEN MATCHED THEN
        UPDATE SET T.artist = S.artist
    `);
    
    await bq.dataset(DATASET_ID).table(tempTableId).delete();
    fs.unlinkSync(tempFile);
    console.log('BigQuery recovery completed.');
  }

  console.log('--- Recovery Sync Completed Successfully ---');
}

runRecovery().catch(console.error);
