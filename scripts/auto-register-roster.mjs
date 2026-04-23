import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const ROSTER_SHEET_ID = 529344445;

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['\"]|['\"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

async function autoRegisterRoster() {
  console.log('--- Starting Auto Artist Registration to Label_Roster ---');

  // 1. Get Productions from Artists sheet
  const resArtists = await sheets.spreadsheets.values.get({ 
    spreadsheetId: SHEET_ID, 
    range: 'Artists!A2:F' 
  });
  const productions = (resArtists.data.values || [])
    .filter(r => r[5] === 'P' || r[5] === 'Production' || r[12] === 'P') // Column F is Type (index 5)
    .map(r => r[0].trim());

  if (productions.length === 0) {
    console.log('No production channels found in Artists sheet.');
    return;
  }
  console.log(`Monitoring ${productions.length} production channels.`);

  // 2. Get current Label_Roster
  const resRoster = await sheets.spreadsheets.values.get({ 
    spreadsheetId: SHEET_ID, 
    range: 'Label_Roster!A2:C' 
  });
  const currentRoster = resRoster.data.values || [];
  const existingKeys = new Set(currentRoster.map(r => `${r[0].trim()}|${r[1].trim()}`.toLowerCase()));

  // 3. Query BigQuery for recently added songs from these Productions
  // We look back 2 days to ensure we don't miss anything from the latest run
  const prodMatchList = productions.map(p => `'${p.replace(/'/g, "\\'")}'`).join(',');
  const query = `
    SELECT artist as production, detectedArtist, videoId, title
    FROM \`heat_ranking.songs_master\`
    WHERE artist IN (${prodMatchList})
      AND detectedArtist != '' 
      AND detectedArtist IS NOT NULL
      AND publishedAt > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
    ORDER BY publishedAt DESC
  `;
  const [newCandidates] = await bq.query(query);
  console.log(`Found ${newCandidates.length} recent songs from Productions to check.`);

  // 4. Identify new registrations
  const toRegister = [];
  const processedInRun = new Set();

  for (const candidate of newCandidates) {
    const key = `${candidate.production.trim()}|${candidate.detectedArtist.trim()}`.toLowerCase();
    if (!existingKeys.has(key) && !processedInRun.has(key)) {
      toRegister.push(candidate);
      processedInRun.add(key);
    }
  }

  if (toRegister.length === 0) {
    console.log('No new artists to register today.');
    return;
  }

  console.log(`Registering ${toRegister.length} new artists to Label_Roster...`);

  // 5. Append to Label_Roster and notify
  for (const reg of toRegister) {
    try {
      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Label_Roster!A2:C',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[reg.production, reg.detectedArtist, reg.detectedArtist]]
        }
      });

      const updatedRange = appendRes.data.updates.updatedRange;
      const rowMatch = updatedRange.match(/(\d+)/);
      const rowNum = rowMatch ? rowMatch[0] : 'Unknown';

      // 6. Get Global Artist Count for notification
      const [countRows] = await bq.query(`
        SELECT COUNT(DISTINCT IF(detectedArtist != '' AND detectedArtist IS NOT NULL, detectedArtist, artist)) as total
        FROM \`heat_ranking.songs_master\`
      `);
      const totalArtists = countRows[0].total;

      // 7. Telegram Notification
      const message = `
✨ <b>新所属アーティスト自動登録</b>

👤 <b>アーティスト</b>: ${reg.detectedArtist}
🏢 <b>プロダクション</b>: ${reg.production}
📝 <b>名簿行番号</b>: ${rowNum}
🔗 <b>対象曲</b>: <a href="https://www.youtube.com/watch?v=${reg.videoId}">${reg.title}</a>

📊 <b>現在の総アーティスト数</b>: ${totalArtists}名
`;
      await sendTelegramNotification(message);
      console.log(`  Registered and notified: ${reg.detectedArtist} (${reg.production})`);

      // Rate limit safety
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  Failed to register ${reg.detectedArtist}:`, err.message);
    }
  }

  console.log('--- Auto Registration Completed ---');
}

autoRegisterRoster().catch(error => {
  console.error('Fatal Error during auto-registration:', error);
});
