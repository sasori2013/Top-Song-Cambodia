import { BigQuery } from '@google-cloud/bigquery';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const PROJECT_ID = env.GCP_PROJECT_ID;
const rawJson = (env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

const [rows] = await bq.query(`
  SELECT COUNT(*) as cnt
  FROM \`heat_ranking.snapshots\` snap
  JOIN \`heat_ranking.songs_master\` s ON snap.videoId = s.videoId
  WHERE snap.date = (SELECT MAX(date) FROM \`heat_ranking.snapshots\`)
    AND snap.views >= 3000000
`);
console.log('300万再生以上の曲数:', rows[0].cnt);

const [top] = await bq.query(`
  SELECT snap.views, s.title, s.artist, s.publishedAt
  FROM \`heat_ranking.snapshots\` snap
  JOIN \`heat_ranking.songs_master\` s ON snap.videoId = s.videoId
  WHERE snap.date = (SELECT MAX(date) FROM \`heat_ranking.snapshots\`)
    AND snap.views >= 3000000
  ORDER BY snap.views DESC
  LIMIT 50
`);
console.log('\n--- メガヒット候補 ---');
top.forEach((r, i) => {
  const v = Number(r.views);
  console.log(`${i+1}. ${(v/1000000).toFixed(1)}M  ${r.artist} - ${r.title}`);
});
