import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_SNAPSHOTS = 'snapshots';
const TABLE_HISTORY = 'rank_history';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function runRankingNode() {
  const args = process.argv.slice(2);
  const forcedDate = args.find(a => a.startsWith('--date='))?.split('=')[1];
  const forcedBase = args.find(a => a.startsWith('--base='))?.split('=')[1];

  console.log('--- Ranking Generation (Node.js) Started ---');
  let latestDate, baseDate;

  if (forcedDate) {
    latestDate = forcedDate;
    if (forcedBase) {
      baseDate = forcedBase;
    } else {
      const [prevRows] = await bq.query(`SELECT DISTINCT date FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` WHERE date < '${forcedDate}' ORDER BY date DESC LIMIT 1`);
      if (prevRows.length === 0) throw new Error(`No base data found before ${forcedDate}`);
      baseDate = prevRows[0].date.value;
    }
  } else {
    const [dateRows] = await bq.query(`SELECT DISTINCT date FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` ORDER BY date DESC LIMIT 2`);
    if (dateRows.length < 2) return console.error('Not enough snapshot dates');
    latestDate = dateRows[0].date.value;
    baseDate = dateRows[1].date.value;
  }

  console.log(`Analyzing: ${latestDate} (Latest) vs ${baseDate} (Base)`);

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
    prev_ranks AS (
        SELECT videoId, rank as prevRank
        FROM \`${DATASET_ID}.${TABLE_HISTORY}\`
        WHERE date = '${baseDate}' AND type = 'DAILY'
    )
    SELECT 
      l.videoId, l.views as totalV, l.likes as totalL, l.comments as totalC,
      b.views as baseV, b.likes as baseL, b.comments as baseC,
      s.artist, s.title, s.publishedAt,
      p.prevRank
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN prev_ranks p ON l.videoId = p.videoId
    JOIN \`${DATASET_ID}.songs_master\` s ON l.videoId = s.videoId
    WHERE s.publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
  `;
  
  const [rows] = await bq.query(sql);
  console.log(`Fetched ${rows.length} records.`);

  const calculateScore = (data) => {
    return data.map(r => {
      const dv = Math.max(0, r.totalV - (r.baseV || r.totalV));
      const dl = Math.max(0, r.totalL - (r.baseL || r.totalL));
      const dc = Math.max(0, r.totalC - (r.baseC || r.totalC));
      
      let score = (5 * Math.log(dv + 1)) + (dv / 10000);
      const totalVWeight = 1 + (Math.log10(r.totalV + 1) / 10);
      score *= totalVWeight;
      
      const growthRate = r.baseV > 0 ? dv / r.baseV : 0;
      const engagement = r.totalV > 0 ? (r.totalL + r.totalC) / r.totalV : 0;
      
      return { ...r, heat: score, dv, dl, dc, growthRate, engagement };
    }).sort((a, b) => b.heat - a.heat);
  };

  const ranked = calculateScore(rows).slice(0, 40);

  // Metadata from Sheets
  const [resSongs, resSongsLong] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A2:D' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A2:D' })
  ]);
  const songMeta = new Map();
  const ps = (r) => (r || []).forEach(x => songMeta.set(x[0], { artist: x[1], title: x[2] }));
  ps(resSongs.data.values);
  ps(resSongsLong.data.values);

  const output = ranked.map((x, i) => [
    latestDate, i + 1, x.prevRank || '-', // Previous Rank included here
    String(songMeta.get(x.videoId)?.artist || x.artist || ''), 
    String(songMeta.get(x.videoId)?.title || x.title || ''),
    x.publishedAt instanceof Object ? x.publishedAt.value : String(x.publishedAt || ''), 
    '', '-', '-', '-', '-', '-', '-', Math.round(x.heat * 100) / 100, 
    '100%', Math.round(x.growthRate * 10000)/100 + '%', 
    Math.round(x.engagement * 10000)/100 + '%', x.dv, x.dl, x.dc, x.totalV, x.baseV || 0,
    `https://youtu.be/${x.videoId}`, '', '', x.videoId
  ]);

  if (output.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: 'RANKING_DAILY!A2:AA41',
      valueInputOption: 'RAW',
      requestBody: { values: output.concat(Array(40 - output.length).fill(Array(27).fill(''))) }
    });
  }

  // Update history table in BQ
  console.log(`Updating rank_history for ${latestDate}...`);
  await bq.query(`DELETE FROM \`${DATASET_ID}.${TABLE_HISTORY}\` WHERE date = '${latestDate}' AND type = 'DAILY'`);
  const historyRows = ranked.map((x, i) => ({
    date: latestDate, type: 'DAILY', rank: i + 1, videoId: x.videoId, heatScore: x.heat
  }));
  await bq.dataset(DATASET_ID).table(TABLE_HISTORY).insert(historyRows);
  
  console.log('--- Ranking Generation Completed ---');
}
runRankingNode().catch(console.error);
