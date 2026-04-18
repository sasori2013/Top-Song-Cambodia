import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;

const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function backfill() {
  console.log('--- Starting Backfill of DetectedArtist from Label_Roster ---');

  // 1. Get Label_Roster rules
  const resRoster = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A2:C' });
  const rosterMap = new Map();
  (resRoster.data.values || []).forEach(r => {
    const prodName = (r[0] || '').trim();
    const targetArtist = (r[1] || '').trim();
    const keywordsRaw = (r[2] || '').trim();
    if (prodName && targetArtist && keywordsRaw) {
      if (!rosterMap.has(prodName)) rosterMap.set(prodName, []);
      const keywords = keywordsRaw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      rosterMap.get(prodName).push({ targetArtist, keywords });
    }
  });

  console.log(`Loaded mapping rules for ${rosterMap.size} productions.`);

  // 2. Fetch target songs from BigQuery
  const prodNamesSQL = Array.from(rosterMap.keys()).map(p => `'${p.replace(/'/g, "\\'")}'`).join(',');
  const [songs] = await bq.query(`
    SELECT videoId, artist, title, detectedArtist 
    FROM \`heat_ranking.songs_master\` 
    WHERE artist IN (${prodNamesSQL})
  `);

  console.log(`Evaluating ${songs.length} songs belonging to these productions...`);

  // 3. Find matches that need updating
  const updates = [];
  let alreadySetCount = 0;

  for (const song of songs) {
    const rules = rosterMap.get(song.artist);
    if (!rules) continue;

    const titleLower = song.title.toLowerCase();
    for (const rule of rules) {
      if (rule.keywords.some(kw => titleLower.includes(kw))) {
        // Match found!
        if (song.detectedArtist === rule.targetArtist) {
          alreadySetCount++;
        } else {
          updates.push({ videoId: song.videoId, newArtist: rule.targetArtist });
        }
        break; // Stop checking other rules for this song
      }
    }
  }

  console.log(`Found ${updates.length} songs that need DetectedArtist updates. (${alreadySetCount} already perfectly matched)`);

  if (updates.length === 0) {
    console.log('No updates needed. Exiting.');
    return;
  }

  // 4. Update BigQuery in batches using CASE statements for efficiency
  // E.g. UPDATE table SET detectedArtist = CASE videoId WHEN 'a' THEN 'X' WHEN 'b' THEN 'Y' ELSE detectedArtist END WHERE videoId IN ('a','b')
  const BATCH_SIZE = 100;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    
    let sqlCases = '';
    const idList = [];
    batch.forEach(u => {
      idList.push(`'${u.videoId}'`);
      sqlCases += `WHEN '${u.videoId}' THEN '${u.newArtist.replace(/'/g, "\\'")}' \n`;
    });

    const updateQuery = `
      UPDATE \`heat_ranking.songs_master\`
      SET detectedArtist = CASE videoId
        ${sqlCases}
        ELSE detectedArtist
      END
      WHERE videoId IN (${idList.join(',')})
    `;

    try {
      await bq.query(updateQuery);
      process.stdout.write(`.` ); // progress indicator
    } catch (e) {
      console.error(`\nError updating batch ${i}:`, e.message);
    }
  }

  console.log(`\nBigQuery Update Complete for ${updates.length} songs!`);

  // 5. Provide instructions for syncing to sheets
  console.log('NOTE: To reflect these changes in the Google Sheets (SONGS / SONGS_LONG), please run:');
  console.log('  node scripts/sync-bq-to-sheets.mjs');
}

backfill().catch(console.error);
