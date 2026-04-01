import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

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
  console.log('--- Ranking Generation (Node.js) Started ---');
  await sendTelegramNotification('🔥 <b>デイリーランキング生成 (generateRanking)</b> を開始します...');

  // 1. Get dates from BQ
  const [dateRows] = await bq.query(`SELECT DISTINCT date FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` ORDER BY date DESC LIMIT 2`);
  if (dateRows.length < 2) {
    console.error('Not enough snapshot dates in BigQuery.');
    return;
  }
  const latestDate = dateRows[0].date.value || dateRows[0].date;
  const baseDate = dateRows[1].date.value || dateRows[1].date;
  console.log(`Analyzing: ${latestDate} (Latest) vs ${baseDate} (Base)`);

  // 2. Query snapshots for these two dates
  const sql = `
    WITH latest AS (
      SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
      WHERE date = '${latestDate}'
      QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    base AS (
      SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
      WHERE date = '${baseDate}'
      QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    history AS (
        -- Get previous rank from history table if available
        SELECT videoId, rank as prevRank 
        FROM \`${DATASET_ID}.${TABLE_HISTORY}\` 
        WHERE CAST(date AS STRING) LIKE '${baseDate}%' AND UPPER(type) = 'DAILY'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY rank ASC) = 1
    )
    SELECT 
      l.videoId,
      l.views as totalV, l.likes as totalL, l.comments as totalC,
      l.qualityScore, l.qualitySummary,
      b.views as baseV, b.likes as baseL, b.comments as baseC,
      h.prevRank
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN history h ON l.videoId = h.videoId
  `;
  const [rows] = await bq.query(sql);
  console.log(`Fetched ${rows.length} records.`);

  // 3. Metadata from Artists/Songs (for artist name, title)
  const resSongs = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:D' });
  const songMeta = new Map();
  (resSongs.data.values || []).forEach(r => {
    if (r[0]) songMeta.set(r[0].trim(), { artist: r[1], title: r[2], publishedAt: r[3] });
  });

  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:E' });
  const artistMeta = new Map();
  (resArtists.data.values || []).forEach(r => {
    if (r[0]) artistMeta.set(r[0].trim(), { subs: parseInt(r[3]) || 0, fb: r[4] });
  });

  // 4. Calculate Scores
  const rankedList = rows.map(row => {
    const dv = Math.max(0, row.totalV - (row.baseV || 0));
    const dl = Math.max(0, row.totalL - (row.baseL || 0));
    const dc = Math.max(0, row.totalC - (row.baseC || 0));
    const growthRate = row.baseV > 0 ? dv / row.baseV : (dv > 0 ? 1.0 : 0);
    const engagement = row.totalV > 0 ? (row.totalL + row.totalC) / row.totalV : 0;
    const qFactor = row.qualityScore || 1.0;
    
    const heat = calculateHeatScore(dv, dl, dc, row.totalV, growthRate, engagement, qFactor);
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
  const top40 = rankedList.slice(0, 40);

  // 5. Build Output (27 columns)
  const output = top40.map((x, i) => [
    latestDate,
    i + 1, // rank
    x.prevRank || '-',
    x.artist,
    x.title,
    x.publishedAt || '',
    '', // spark (Formula ignored in Node version for stability, or could replicate)
    '-', // aiScore
    '-', // aiReason
    '-', // aiInsight
    '-', // shortInsight
    '-', // genre
    '-', // visualConcept
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
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: Array(40).fill(Array(27).fill('')) },
    });
    // Write new
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `RANKING_DAILY!A2:AA${output.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: output },
    });
    console.log(`Updated RANKING_DAILY with ${output.length} items.`);

    // 7. Record Rank History in BigQuery
    const historyRows = top40.map((x, i) => ({
      date: latestDate,
      videoId: x.videoId,
      type: 'DAILY',
      rank: i + 1,
      heatScore: Math.round(x.heat * 100) / 100
    }));
    await bq.dataset(DATASET_ID).table(TABLE_HISTORY).insert(historyRows);
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
  await sendTelegramNotification(`✅ <b>ランキング作成完了</b>\nTop 40 の生成とシート書込に成功しました。\n(比較対象: ${baseDate})`);
}

runRankingNode().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>ランキング生成エラー</b>\n<code>${error.message}</code>`);
});
