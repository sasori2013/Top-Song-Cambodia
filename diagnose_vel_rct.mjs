import { readFileSync } from 'fs';
import { BigQuery } from '@google-cloud/bigquery';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/GOOGLE_SERVICE_ACCOUNT_JSON='([\s\S]+?)'{1,2}\n/);
const rawJson = match[1].replace(/'$/, '');
const creds = JSON.parse(rawJson);
creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: 'kxolab-486112', credentials: creds });
const DS = 'heat_ranking';

const [meta] = await bq.dataset(DS).table('snapshots').getMetadata();
console.log('snapshots columns:', meta.schema.fields.map(f => `${f.name}(${f.type})`).join(', '));

// base=04-28 vs base=04-27 の比較
const [dvRows28] = await bq.query(`
  SELECT r.rank, s.artist,
    snap.views as totalV, snap.likes as likes, snap.comments as comments,
    prev28.views as prevV28, prev27.views as prevV27
  FROM \`${DS}.rank_history\` r
  JOIN \`${DS}.songs_master\` s ON r.videoId = s.videoId
  LEFT JOIN \`${DS}.snapshots\` snap ON r.videoId = snap.videoId AND CAST(snap.date AS STRING) = '2026-04-29'
  LEFT JOIN \`${DS}.snapshots\` prev28 ON r.videoId = prev28.videoId AND CAST(prev28.date AS STRING) = '2026-04-28'
  LEFT JOIN \`${DS}.snapshots\` prev27 ON r.videoId = prev27.videoId AND CAST(prev27.date AS STRING) = '2026-04-27'
  WHERE CAST(r.date AS STRING) = '2026-04-29' AND r.type = 'DAILY'
  ORDER BY r.rank ASC LIMIT 8
`);

console.log('\n=== Top8: base04-28 vs base04-27 ===');
dvRows28.forEach(r => {
  const dv28 = Math.max(0, (r.totalV||0) - (r.prevV28||0));
  const dv27 = Math.max(0, (r.totalV||0) - (r.prevV27||0));
  const g28 = r.prevV28 ? (dv28/r.prevV28*100).toFixed(2)+'%' : 'NULL';
  const g27 = r.prevV27 ? (dv27/r.prevV27*100).toFixed(2)+'%' : 'NULL';
  const eng = r.totalV > 0 ? ((Number(r.likes||0)+Number(r.comments||0))/r.totalV*100).toFixed(2)+'%' : 'N/A';
  console.log(`  #${r.rank} ${r.artist}`);
  console.log(`    totalV=${r.totalV}, likes=${r.likes}, comments=${r.comments}`);
  console.log(`    [04-28] dv=${dv28}, VEL=${g28} | [04-27] dv=${dv27}, VEL=${g27} | RCT=${eng}`);
});
