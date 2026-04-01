/**
 * Debug script to check top 5 songs' raw data from BQ and calculated heat scores.
 */
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

function calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, qFactor = 1.0) {
  const scale = 1 + (Math.log10(totalV + 1) / 10);
  const dailyViewCore = (5 * Math.log(dv + 1)) + (dv / 10000);
  const baseViewScore = dailyViewCore * scale;
  const reactionScore = (3 * Math.log(dl + 1)) + (5 * Math.log(dc + 1) * qFactor);
  const momentumBonus = Math.min(5, growthRate * 5) + Math.min(5, engagement * 100);
  return baseViewScore + reactionScore + momentumBonus;
}

async function debug() {
  const [dateRows] = await bq.query(`SELECT DISTINCT date FROM \`${DATASET_ID}.snapshots\` ORDER BY date DESC LIMIT 2`);
  const latestDate = dateRows[0].date.value;
  const baseDate = dateRows[1].date.value;
  console.log(`Latest: ${latestDate}, Base: ${baseDate}`);

  const [rows] = await bq.query(`
    WITH latest AS (
        SELECT videoId, views, likes, comments FROM \`${DATASET_ID}.snapshots\` 
        WHERE CAST(date AS STRING) = '${latestDate}'
    ),
    base AS (
        SELECT videoId, views as baseV FROM \`${DATASET_ID}.snapshots\` 
        WHERE CAST(date AS STRING) = '${baseDate}'
    )
    SELECT l.videoId, l.views as totalV, l.likes as totalL, l.comments as totalC,
           b.baseV, s.artist, s.title, s.publishedAt
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN \`${DATASET_ID}.songs_master\` s ON l.videoId = s.videoId
    ORDER BY l.views DESC LIMIT 10
  `);

  const results = rows.map(row => {
    const totalV = parseInt(row.totalV);
    const baseV = row.baseV ? parseInt(row.baseV) : null;
    const publishedAt = row.publishedAt ? new Date(row.publishedAt.value) : null;
    const hoursOld = publishedAt ? (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60) : 999;

    let dv = 0;
    if (baseV !== null) dv = Math.max(0, totalV - baseV);
    else if (hoursOld < 48) dv = totalV;

    const dl = parseInt(row.totalL) - 0;
    const dc = parseInt(row.totalC) - 0;
    const growthRate = (baseV && baseV > 0) ? dv / baseV : (dv > 0 ? 1.0 : 0);
    const engagement = totalV > 0 ? (parseInt(row.totalL) + parseInt(row.totalC)) / totalV : 0;
    const heat = Math.round(calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, 1.0));

    return {
      artist: row.artist?.slice(0, 20),
      totalV,
      baseV: baseV ?? 'MISSING',
      dv,
      heat,
      hoursOld: Math.round(hoursOld),
    };
  });
  console.table(results);
}

debug().catch(console.error);
