import { readFileSync } from 'fs';
import { BigQuery } from '@google-cloud/bigquery';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/GOOGLE_SERVICE_ACCOUNT_JSON='([\s\S]+?)'{1,2}\n/);
const rawJson = match[1].replace(/'$/, '');
const creds = JSON.parse(rawJson);
creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: 'kxolab-486112', credentials: creds });
const DS = 'heat_ranking';

// 直近5日のsnapshotsの件数（完全か確認）
console.log('=== snapshots 直近5日の件数 ===');
const [counts] = await bq.query(`
  SELECT CAST(date AS STRING) as d, COUNT(*) as cnt,
    SUM(views) as total_views, SUM(likes) as total_likes, SUM(comments) as total_comments
  FROM \`${DS}.snapshots\`
  WHERE date >= DATE_SUB(CURRENT_DATE('Asia/Bangkok'), INTERVAL 5 DAY)
  GROUP BY date ORDER BY date DESC
`);
counts.forEach(r => console.log(`  ${r.d}: ${r.cnt}件 | views=${Number(r.total_views).toLocaleString()}, likes=${Number(r.total_likes).toLocaleString()}, comments=${Number(r.total_comments).toLocaleString()}`));

// 現在のDAILY ACTIONS クエリ（bigquery.tsと同じ）
console.log('\n=== 現在のDAILY ACTIONSクエリ結果 ===');
const [actionRows] = await bq.query(`
  WITH daily AS (
    SELECT
      videoId, date,
      views,    LAG(views)    OVER(PARTITION BY videoId ORDER BY date) AS prev_views,
      likes,    LAG(likes)    OVER(PARTITION BY videoId ORDER BY date) AS prev_likes,
      comments, LAG(comments) OVER(PARTITION BY videoId ORDER BY date) AS prev_comments
    FROM \`${DS}.snapshots\`
    WHERE date >= DATE_SUB(CURRENT_DATE('Asia/Bangkok'), INTERVAL 2 DAY)
  )
  SELECT
    CAST(date AS STRING) as target_date,
    COALESCE(SUM(CASE WHEN views    > prev_views    THEN views    - prev_views    ELSE 0 END), 0) AS inc_views,
    COALESCE(SUM(CASE WHEN likes    > prev_likes    THEN likes    - prev_likes    ELSE 0 END), 0) AS inc_likes,
    COALESCE(SUM(CASE WHEN comments > prev_comments THEN comments - prev_comments ELSE 0 END), 0) AS inc_comments,
    COUNT(*) as rows_total,
    COUNTIF(prev_views IS NOT NULL) as rows_with_prev
  FROM daily
  WHERE date = DATE_SUB(CURRENT_DATE('Asia/Bangkok'), INTERVAL 1 DAY)
    AND prev_views IS NOT NULL
  GROUP BY date
`);
if (actionRows.length === 0) {
  console.log('  結果なし（prev_views IS NULLが全件か、対象日のデータなし）');
} else {
  actionRows.forEach(r => console.log(`  対象日=${r.target_date}: views+=${Number(r.inc_views).toLocaleString()}, likes+=${Number(r.inc_likes).toLocaleString()}, comments+=${Number(r.inc_comments).toLocaleString()} | rows_with_prev=${r.rows_with_prev}`));
}

// 直近3日のペアを手動で確認
console.log('\n=== 日別増分を手動計算（直近3ペア）===');
const dates = counts.map(r => r.d).slice(0, 4);
for (let i = 0; i < Math.min(3, dates.length - 1); i++) {
  const d1 = dates[i];   // later
  const d2 = dates[i+1]; // earlier
  const [diffRows] = await bq.query(`
    SELECT
      SUM(CASE WHEN s1.views > s2.views THEN s1.views - s2.views ELSE 0 END) as dv,
      SUM(CASE WHEN s1.likes > s2.likes THEN s1.likes - s2.likes ELSE 0 END) as dl,
      SUM(CASE WHEN s1.comments > s2.comments THEN s1.comments - s2.comments ELSE 0 END) as dc,
      COUNT(*) as matched_songs
    FROM \`${DS}.snapshots\` s1
    JOIN \`${DS}.snapshots\` s2 ON s1.videoId = s2.videoId
    WHERE CAST(s1.date AS STRING) = '${d1}' AND CAST(s2.date AS STRING) = '${d2}'
  `);
  const r = diffRows[0];
  console.log(`  ${d2} → ${d1}: dv=+${Number(r.dv).toLocaleString()}, dl=+${Number(r.dl).toLocaleString()}, dc=+${Number(r.dc).toLocaleString()} (${r.matched_songs}曲マッチ)`);
}
