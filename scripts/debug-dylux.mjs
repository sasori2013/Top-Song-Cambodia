import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_SNAPSHOTS = 'snapshots';
const TABLE_HISTORY = 'rank_history';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const jsonStr = rawJson.trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function debugSong() {
  const [dateRows] = await bq.query(`SELECT DISTINCT date FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` ORDER BY date DESC LIMIT 2`);
  const latestDate = dateRows[0].date.value;
  const baseDate = dateRows[1].date.value;

  console.log(`Debug for: ${latestDate} vs ${baseDate}`);

  const query = `
    WITH latest AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${latestDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    base AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${baseDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    )
    SELECT 
      l.videoId,
      l.views as totalV,
      b.views as baseV,
      s.title,
      s.artist,
      s.publishedAt
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN \`${DATASET_ID}.songs_master\` s ON l.videoId = s.videoId
    WHERE s.artist LIKE '%DYLUX%' OR l.videoId = 'YOUR_VIDEO_ID_HERE'
  `;

  const [rows] = await bq.query(query);
  console.log('Results:');
  console.table(rows);
}

debugSong().catch(console.error);
