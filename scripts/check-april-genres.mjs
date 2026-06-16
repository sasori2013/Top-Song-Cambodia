import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const bq = new BigQuery({ projectId: 'heat-494308', credentials: creds, location: 'asia-northeast1' });

// April genres
const [aprilRows] = await bq.query(`
  SELECT genre, COUNT(*) AS count
  FROM \`heat-494308.heat_ranking.songs_master\`
  WHERE DATE(publishedAt) BETWEEN '2026-04-01' AND '2026-04-30'
    AND genre IS NOT NULL AND genre != ''
  GROUP BY genre
  ORDER BY count DESC
`);
const total = aprilRows.reduce((s, r) => s + Number(r.count), 0);
console.log('=== April 2026 genres ===');
aprilRows.forEach(r => console.log(r.genre.padEnd(25), Number(r.count), (Number(r.count)/total*100).toFixed(1)+'%'));
console.log('Total songs:', total);

// Check a few April songs with genre
const [sampleRows] = await bq.query(`
  SELECT videoId, title, genre, DATE(publishedAt) as pub
  FROM \`heat-494308.heat_ranking.songs_master\`
  WHERE DATE(publishedAt) BETWEEN '2026-04-01' AND '2026-04-30'
  ORDER BY genre
  LIMIT 20
`);
console.log('\n=== Sample April songs ===');
sampleRows.forEach(r => console.log(r.pub, r.genre?.padEnd(20), r.title?.slice(0,40)));
