/**
 * Archive Gap Detection
 *
 * Checks the last 30 days for missing dates in:
 *   - heat_ranking.platform_rankings  (Platform Rankings pipeline)
 *   - heat_ranking.snapshots          (daily-pipeline Layer 1)
 *
 * Run weekly via weekly-pipeline.yml. Sends Telegram alert if gaps are found.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sendTelegramNotification } from '../telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');

async function main() {
  const PROJECT_ID = getEnv('GCP_PROJECT_ID');
  const rawJson = getEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(rawJson);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

  console.log('[GapCheck] Checking last 30 days for archive gaps...');

  // Check platform_rankings: expect both apple_music and spotify each day
  const [rankingRows] = await bq.query(`
    WITH dates AS (
      SELECT d AS date
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))) d
    ),
    covered AS (
      SELECT DISTINCT date, platform
      FROM \`heat_ranking.platform_rankings\`
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    )
    SELECT
      d.date,
      COUNTIF(c.platform = 'apple_music') > 0 AS has_apple,
      COUNTIF(c.platform = 'spotify') > 0 AS has_spotify
    FROM dates d
    LEFT JOIN covered c ON c.date = d.date
    GROUP BY d.date
    HAVING NOT has_apple OR NOT has_spotify
    ORDER BY d.date
  `);

  // Check snapshots: expect at least one row per day
  const [snapshotRows] = await bq.query(`
    WITH dates AS (
      SELECT d AS date
      FROM UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))) d
    ),
    covered AS (
      SELECT DISTINCT DATE(snapshotDate) AS date
      FROM \`heat_ranking.snapshots\`
      WHERE DATE(snapshotDate) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    )
    SELECT d.date
    FROM dates d
    LEFT JOIN covered c ON c.date = d.date
    WHERE c.date IS NULL
    ORDER BY d.date
  `).catch(e => {
    console.warn('[GapCheck] snapshots query failed (table may not exist):', e.message);
    return [[]];
  });

  const rankingGaps = rankingRows.map(r => {
    const missing = [];
    if (!r.has_apple) missing.push('AM');
    if (!r.has_spotify) missing.push('SP');
    return `${r.date.value} (${missing.join('+')})`;
  });

  const snapshotGaps = snapshotRows.map(r => r.date.value || String(r.date));

  console.log(`[GapCheck] Platform ranking gaps: ${rankingGaps.length}`);
  console.log(`[GapCheck] Snapshot gaps: ${snapshotGaps.length}`);

  if (rankingGaps.length === 0 && snapshotGaps.length === 0) {
    console.log('[GapCheck] No gaps found. Archive is complete.');
    await sendTelegramNotification(
      `✅ <b>アーカイブ整合性チェック（過去30日）</b>\n\nGap なし — データは完全です。`
    );
    return;
  }

  let msg = `⚠️ <b>アーカイブ欠損検出（過去30日）</b>\n\n`;

  if (rankingGaps.length > 0) {
    msg += `📊 <b>Platform Rankings 欠損 (${rankingGaps.length}日):</b>\n`;
    msg += rankingGaps.map(d => `• ${d}`).join('\n') + '\n\n';
  }

  if (snapshotGaps.length > 0) {
    msg += `🎵 <b>Songs Snapshot 欠損 (${snapshotGaps.length}日):</b>\n`;
    msg += snapshotGaps.map(d => `• ${d}`).join('\n') + '\n\n';
  }

  msg += `※ 手動で該当日のパイプラインを再実行してください。`;

  await sendTelegramNotification(msg);
  console.log('[GapCheck] Gap alert sent via Telegram.');
}

main().catch(async e => {
  console.error('[GapCheck] Fatal error:', e);
  await sendTelegramNotification(
    `🚨 <b>アーカイブ整合性チェック — エラー</b>\n\n<code>${e.message}</code>`
  ).catch(() => {});
  process.exit(1);
});
