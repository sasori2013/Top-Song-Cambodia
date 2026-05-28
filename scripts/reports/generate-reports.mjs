/**
 * generate-reports.mjs
 *
 * 日次バッチ：全クライアントのレポートHTMLを生成し GCS に保存する。
 * GitHub Actions から毎日実行。
 */
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { createBQ, getRisingArtistSignals, getMarketSignals } from './data-processor.mjs';
import { fetchArtistInsights } from './insights-fetcher.mjs';
import { renderReport } from './html-renderer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const DS          = 'heat_ranking';
const GCS_BUCKET  = process.env.REPORT_GCS_BUCKET || 'heat-reports';
const PROJECT_ID  = process.env.GCP_PROJECT_ID;

const credentials = JSON.parse((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq      = createBQ(credentials, PROJECT_ID);
const storage = new Storage({ projectId: PROJECT_ID, credentials });
const bucket  = storage.bucket(GCS_BUCKET);

const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

// ── 1. アクティブなクライアント一覧を取得 ────────────────────────
const [clients] = await bq.query(`
  SELECT slug, company_name, industry
  FROM \`${DS}.report_clients\`
  WHERE is_active = TRUE
  ORDER BY created_at
`);

console.log(`対象クライアント: ${clients.length} 件\n`);

// ── 2. 共通データ（マーケット概況）は一度だけ取得 ──────────────
const market = await getMarketSignals(bq);

// ── 3. クライアントごとにHTML生成 → GCS保存 ────────────────────
let success = 0, failed = 0;

for (const client of clients) {
  try {
    console.log(`生成中: ${client.slug} (${client.company_name})`);

    const artists = await getRisingArtistSignals(bq, client.industry);

    if (artists.length === 0) {
      console.warn(`  ⚠ データなし: スキップ`);
      failed++;
      continue;
    }

    // アーティストごとにコメント・歌詞分析を付加（キャッシュ優先）
    const artistsWithInsights = await Promise.all(
      artists.map(async a => ({
        ...a,
        insights: await fetchArtistInsights(bq, a.videoId, a.artist).catch(err => {
          console.warn(`    insights エラー (${a.artist}): ${err.message}`);
          return null;
        }),
      }))
    );

    const html = renderReport({ client, artists: artistsWithInsights, market, reportDate });

    // GCSに保存: reports/{slug}/index.html
    const file = bucket.file(`reports/${client.slug}/index.html`);
    await file.save(html, {
      contentType: 'text/html; charset=utf-8',
      metadata: {
        cacheControl: 'no-store, no-cache',
        'x-report-date': reportDate,
        'x-client': client.slug,
      },
    });

    console.log(`  ✓ 保存完了: gs://${GCS_BUCKET}/reports/${client.slug}/index.html`);
    success++;

  } catch (err) {
    console.error(`  ✗ ${client.slug}: ${err.message}`);
    failed++;
  }
}

console.log(`\n完了: ${success}件成功 / ${failed}件失敗`);
if (failed > 0) process.exit(1);
