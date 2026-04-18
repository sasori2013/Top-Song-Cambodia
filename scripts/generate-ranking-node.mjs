import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_SNAPSHOTS = 'snapshots';
const TABLE_HISTORY = 'rank_history';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

/**
 * EXACT REPLICA of GAS calculateHeatScore_ (PickSongs.js L885-910)
 */
function calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, qFactor = 1.0) {
  // scale based on total views (PickSongs.js L874)
  const scale = 1 + (Math.log10(totalV + 1) / 10);
  
  // dailyViewCore (L899)
  const dailyViewCore = (5 * Math.log(dv + 1)) + (dv / 10000);
  const baseViewScore = dailyViewCore * scale;
  
  // reactionScore (いいね 3倍, コメ 5倍 + 品質因子) (L905)
  const reactionScore = (3 * Math.log(dl + 1)) + (5 * Math.log(dc + 1) * qFactor);
  
  // momentumBonus (L908)
  const momentumBonus = Math.min(5, growthRate * 5) + Math.min(5, engagement * 100);
  
  return baseViewScore + reactionScore + momentumBonus;
}

async function runRankingNode() {
  const args = process.argv.slice(2);
  const forcedDate = args.find(a => a.startsWith('--date='))?.split('=')[1];
  const forcedBase = args.find(a => a.startsWith('--base='))?.split('=')[1];

  console.log('--- Ranking Generation (Node.js) Started ---');
  await sendTelegramNotification(`🔥 <b>デイリーランキング生成 (generateRanking)</b> を開始します...${forcedDate ? `\n(指定日: ${forcedDate})` : ''}`);
  await updateProcessStatus('Ranking: Analyzing Data', 0, 100);

  let latestDate, baseDate;
  
  // 1. Get dates from BQ and check for stability (at least 400 records)
  const [dateRows] = await bq.query(`
    SELECT date, COUNT(videoId) as count 
    FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
    GROUP BY date ORDER BY date DESC LIMIT 7
  `);
  
  // Filter for stable dates (count > 400)
  const stableDates = dateRows
    .filter(r => r.count > 400)
    .map(r => r.date.value);
  const allDates = dateRows.map(r => r.date.value);

  if (stableDates.length === 0) {
    throw new Error("No stable snapshot dates found (>400 records) in the last 7 days.");
  }

  if (forcedDate) {
    latestDate = forcedDate;
  } else {
    latestDate = allDates[0]; // We use the absolute latest for ranking even if unstable (though usually latest is stable)
  }

  if (forcedBase) {
    baseDate = forcedBase;
  } else {
    // Find the newest stable date that is older than latestDate
    baseDate = stableDates.find(d => d < latestDate);
    
    if (!baseDate) {
      // Emergency fallback to the absolute next date if no stable dates found below
      const idx = allDates.indexOf(latestDate);
      baseDate = allDates[idx + 1] || allDates[1];
    }
  }

  console.log(`Analyzing: ${latestDate} (Latest) vs ${baseDate} (Base)`);

  // Validation: Check stability of selected dates
  const latestCount = dateRows.find(r => r.date.value === latestDate)?.count || 0;
  const baseCount = dateRows.find(r => r.date.value === baseDate)?.count || 0;
  
  if (latestCount < 400) console.warn(`⚠️ Warning: Latest date ${latestDate} is unstable (${latestCount} records).`);
  if (baseCount < 400) console.warn(`⚠️ Warning: Base date ${baseDate} is unstable (${baseCount} records).`);

  console.log(`Analyzing: ${latestDate} (Latest) vs ${baseDate} (Base)`);

  // 2. Query snapshots for these two dates
  const sql = `
    WITH latest AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${latestDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    base AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${baseDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    history AS (
        -- Get previous rank from history table if available
        SELECT videoId, rank as prevRank 
        FROM \`${DATASET_ID}.${TABLE_HISTORY}\` 
        WHERE CAST(date AS STRING) = '${baseDate}' AND UPPER(type) = 'DAILY'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY rank ASC) = 1
    ),
    songs_master_dedup AS (
        SELECT * FROM \`${DATASET_ID}.songs_master\`
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY publishedAt DESC) = 1
    )
    SELECT 
      l.videoId,
      l.views as totalV, l.likes as totalL, l.comments as totalC,
      b.views as baseV, b.likes as baseL, b.comments as baseC,
      h.prevRank,
      s.publishedAt, s.eventTag, s.category
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN history h ON l.videoId = h.videoId
    JOIN songs_master_dedup s ON l.videoId = s.videoId
    WHERE s.publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
  `;
  const [rows] = await bq.query(sql);
  console.log(`Fetched ${rows.length} records.`);

  // 3. Metadata from Artists/Songs (for artist name, title)
  const [resSongs] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:H' }) // Up to 'featuring'
  ]);

  const songMeta = new Map();
  const processRows = (rows) => {
    (rows || []).forEach(r => {
      if (r[0]) {
        // r[1]: artist, r[2]: title, r[3]: publishedAt, r[6]: detectedArtist
        let finalArtist = r[1];
        if (r[6] && r[6].trim() !== '') {
          finalArtist = r[6].trim();
        }
        songMeta.set(r[0].trim(), { artist: finalArtist, original: r[1], title: r[2], publishedAt: r[3] });
      }
    });
  };

  processRows(resSongs.data.values);

  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:E' });
  const artistMeta = new Map();
  (resArtists.data.values || []).forEach(r => {
    if (r[0]) artistMeta.set(r[0].trim(), { subs: parseInt(r[3]) || 0, fb: r[4] });
  });

  console.log(`Fetched ${rows.length} records.`);
  await updateProcessStatus('Ranking: Calculating Scores', 20, 100);
  const rankedList = rows.map(row => {
    const totalV = parseInt(row.totalV);
    const totalL = parseInt(row.totalL);
    const totalC = parseInt(row.totalC);
    
    // Safety check for growth: 
    // If we have yesterday's data, use it.
    // If not, only treat it as "new growth" if the song was published in the last 48 hours.
    const baseV = row.baseV ? parseInt(row.baseV) : null;
    const baseL = row.baseL ? parseInt(row.baseL) : 0;
    const baseC = row.baseC ? parseInt(row.baseC) : 0;

    // If we have yesterday's data, calculate the actual increase.
    // If not (song just discovered today), set growth to 0 for safety.
    // This avoids old songs with no baseline being treated as rocket-ships.
    const dv = baseV !== null ? Math.max(0, totalV - baseV) : 0;

    const dl = Math.max(0, totalL - baseL);
    const dc = Math.max(0, totalC - baseC);
    const growthRate = (baseV && baseV > 0) ? dv / baseV : (dv > 0 ? 1.0 : 0);
    const engagement = totalV > 0 ? (totalL + totalC) / totalV : 0;
    const qFactor = row.qualityScore || 1.0;
    
    const heat = calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, qFactor);
    const meta = songMeta.get(row.videoId) || { artist: 'Unknown', title: 'Unknown', publishedAt: '' };
    const aMeta = artistMeta.get(meta.artist) || { subs: 0, fb: '' };

    return {
      ...row,
      ...meta,
      ...aMeta,
      dv, dl, dc, growthRate, engagement, heat
    };
  });

  rankedList.sort((a, b) => b.heat - a.heat);
  
  // 4.5 Abnormal Ranking detection (NEW: Alerting on flat chart)
  if (rankedList.length > 0 && rankedList[0].heat < 40) {
    await sendTelegramNotification(
      `🚨 <b>ランキング異常警報 (generateRanking)</b>\n` +
      `本日のランク1位のスコアが <b>${Math.round(rankedList[0].heat * 100) / 100}</b> と非常に低いです。\n` +
      `データの不整合（昨日のデータ欠落など）が発生している可能性があります。確認してください。`
    );
  }

  const top40 = rankedList.slice(0, 40);

  // 5. Build Output (27 columns)
  const output = top40.map((x, i) => [
    latestDate,
    i + 1, // rank
    x.prevRank || '-',
    x.artist,
    x.title,
    x.publishedAt || '',
    '', // spark
    '-', // aiScore
    '-', // aiReason
    '-', // aiInsight
    '-', // shortInsight
    x.eventTag || '-', // genre
    x.category || '-', // visualConcept
    Math.round(x.heat * 100) / 100,
    Math.round((x.qualityScore || 1.0) * 100) + '%',
    Math.round(x.growthRate * 10000) / 100 + '%',
    Math.round(Math.min(1.0, x.engagement) * 10000) / 100 + '%',
    x.dv,
    x.dl,
    x.dc,
    x.totalV,
    x.baseV || 0,
    `https://youtu.be/${x.videoId}`,
    x.fb ? `=HYPERLINK("${x.fb}","Facebook")` : '',
    '', // alert
    x.videoId
  ]);

  // 6. Update RANKING_DAILY
  if (output.length > 0) {
    // Clear first
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'RANKING_DAILY!A2:AA41',
      valueInputOption: 'RAW',
      requestBody: { values: Array(40).fill(Array(27).fill('')) },
    });
    // Write new
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `RANKING_DAILY!A2:AA${output.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: output },
    });
    console.log(`Updated RANKING_DAILY with ${output.length} items.`);
    await updateProcessStatus('Ranking: Recording History', 80, 100);

    // 7. Record Rank History in BigQuery
    const historyRows = top40.map((x, i) => ({
      date: latestDate,
      videoId: x.videoId,
      type: 'DAILY',
      rank: i + 1,
      heatScore: Math.round(x.heat * 100) / 100
    }));

    // NEW: Delete existing records for the same date and type to prevent duplicates
    console.log(`Deleting existing ranking records for ${latestDate} (DAILY)...`);
    await bq.query(`DELETE FROM \`${DATASET_ID}.${TABLE_HISTORY}\` WHERE date = '${latestDate}' AND type = 'DAILY'`);

    const tempFilePath = join(os.tmpdir(), `history_${latestDate}_${Date.now()}.json`);
    const ndjson = historyRows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(tempFilePath, ndjson);

    await bq.dataset(DATASET_ID).table(TABLE_HISTORY).load(tempFilePath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    fs.unlinkSync(tempFilePath);
    console.log('Recorded rank history in BigQuery.');

    // 8. Record Rank History in Spreadsheet (RANK_HISTORY)
    const sheetHistoryRows = historyRows.map(h => [h.date, h.videoId, h.type, h.rank, h.heatScore]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RANK_HISTORY!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: sheetHistoryRows },
    });
    console.log(`Appended ${sheetHistoryRows.length} rows to RANK_HISTORY sheet.`);
  }

  console.log('--- Ranking Generation (Node.js) Completed ---');
  await updateProcessStatus('Ranking: Completed', 100, 100, 'completed');
  await sendTelegramNotification(`✅ <b>ランキング作成完了</b>\nTop 40 の生成とシート書込に成功しました。\n(比較対象: ${baseDate})`);
}

runRankingNode().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>ランキング生成エラー</b>\n<code>${error.message}</code>`);
});
