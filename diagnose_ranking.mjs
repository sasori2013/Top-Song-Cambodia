import { readFileSync } from 'fs';
import { BigQuery } from '@google-cloud/bigquery';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/GOOGLE_SERVICE_ACCOUNT_JSON='([\s\S]+?)'{1,2}\n/);
const rawJson = match[1].replace(/'$/, '');
const creds = JSON.parse(rawJson);
creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: 'kxolab-486112', credentials: creds });
const DS = 'heat_ranking';

async function q(sql) {
  const [rows] = await bq.query(sql);
  return rows;
}

console.log('\n=== 1. BQ snapshots: 直近7日の件数 ===');
const counts = await q(`
  SELECT CAST(date AS STRING) as d, COUNT(*) as total
  FROM \`${DS}.snapshots\`
  WHERE date >= DATE_SUB(CURRENT_DATE('Asia/Bangkok'), INTERVAL 7 DAY)
  GROUP BY date ORDER BY date DESC
`);
counts.forEach(r => console.log(`  ${r.d}: ${r.total}件`));

console.log('\n=== 2. rank_history: 直近3日のDAILYランキング ===');
const hist = await q(`
  SELECT CAST(date AS STRING) as d, COUNT(*) as cnt
  FROM \`${DS}.rank_history\`
  WHERE type = 'DAILY'
    AND date >= DATE_SUB(CURRENT_DATE('Asia/Bangkok'), INTERVAL 3 DAY)
  GROUP BY date ORDER BY date DESC
`);
hist.forEach(r => console.log(`  ${r.d}: ${r.cnt}件`));

console.log('\n=== 3. 最新ランキング日付のトップ10（artistで確認） ===');
const latestDate = hist[0]?.d;
if (latestDate) {
  const top10 = await q(`
    SELECT r.rank, s.artist, s.title
    FROM \`${DS}.rank_history\` r
    JOIN \`${DS}.songs_master\` s ON r.videoId = s.videoId
    WHERE CAST(r.date AS STRING) = '${latestDate}' AND r.type = 'DAILY'
    ORDER BY r.rank ASC LIMIT 10
  `);
  top10.forEach(r => console.log(`  #${r.rank} ${r.artist} - ${r.title?.substring(0, 40)}`));
}

console.log('\n=== 4. 最新スナップショット日付のartist別内訳（上位10） ===');
const snapDate = counts[0]?.d;
if (snapDate) {
  const byArtist = await q(`
    SELECT s.artist, COUNT(*) as cnt
    FROM \`${DS}.snapshots\` sn
    JOIN \`${DS}.songs_master\` s ON sn.videoId = s.videoId
    WHERE CAST(sn.date AS STRING) = '${snapDate}'
    GROUP BY s.artist ORDER BY cnt DESC LIMIT 10
  `);
  byArtist.forEach(r => console.log(`  ${r.artist}: ${r.cnt}曲`));
}

console.log('\n=== 5. songs_masterのpublishedAt分布（60日以内の件数） ===');
const pubDist = await q(`
  SELECT
    COUNTIF(publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)) as within60d,
    COUNTIF(publishedAt < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)) as older,
    COUNTIF(publishedAt IS NULL) as nullCount,
    COUNT(*) as total
  FROM \`${DS}.songs_master\`
`);
console.log(`  60日以内: ${pubDist[0].within60d}, 60日超: ${pubDist[0].older}, NULL: ${pubDist[0].nullCount}, 合計: ${pubDist[0].total}`);
