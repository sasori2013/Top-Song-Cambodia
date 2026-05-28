/**
 * HEAT B2B Report Server — Cloud Run
 *
 * GET /:slug → GCSから事前生成済みHTMLを返す
 * アクセスはBQに記録。生データは一切ブラウザに渡さない。
 */
import express from 'express';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';

const app  = express();
const PORT = process.env.PORT || 8080;

const DS         = 'heat_ranking';
const GCS_BUCKET = process.env.REPORT_GCS_BUCKET || 'heat-reports';
const PROJECT_ID = process.env.GCP_PROJECT_ID;

// Cloud Run上ではサービスアカウントのADCを使用（env不要）
// ローカル開発時のみGOOGLE_SERVICE_ACCOUNT_JSONを参照
let clientOptions = { projectId: PROJECT_ID };
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  clientOptions = { ...clientOptions, credentials };
}

const bq      = new BigQuery(clientOptions);
const storage = new Storage(clientOptions);
const bucket  = storage.bucket(GCS_BUCKET);

// ── セキュリティヘッダー（全レスポンスに付与） ──────────────────
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options',           'DENY');
  res.setHeader('X-Content-Type-Options',    'nosniff');
  res.setHeader('X-XSS-Protection',          '1; mode=block');
  res.setHeader('Referrer-Policy',           'no-referrer');
  res.setHeader('Cache-Control',             'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma',                    'no-cache');
  res.setHeader('Content-Security-Policy',   "default-src 'self'; script-src 'none'; object-src 'none'; style-src 'unsafe-inline';");
  next();
});

// ── ヘルスチェック ─────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── レポート配信 ───────────────────────────────────────────────
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  // slug のバリデーション（英数字・ハイフンのみ）
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
    return res.status(404).send(notFoundHtml());
  }

  try {
    // 1. クライアント確認（アクティブかどうか）
    const [rows] = await bq.query({
      query: `SELECT slug, company_name FROM \`${DS}.report_clients\`
              WHERE slug = @slug AND is_active = TRUE LIMIT 1`,
      params: { slug },
    });

    if (rows.length === 0) {
      return res.status(404).send(notFoundHtml());
    }

    // 2. GCSから事前生成済みHTMLを取得
    const file = bucket.file(`reports/${slug}/index.html`);
    const [exists] = await file.exists();

    if (!exists) {
      return res.status(503).send(preparingHtml(rows[0].company_name));
    }

    const [contents] = await file.download();
    const html = contents.toString('utf-8');

    // 3. アクセスログをBQに非同期記録（レスポンスをブロックしない）
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
              || req.socket?.remoteAddress
              || 'unknown';
    const ua = req.headers['user-agent'] || '';

    bq.query({
      query: `INSERT INTO \`${DS}.report_access_log\` (id, slug, accessed_at, ip_address, user_agent, report_date)
              VALUES (@id, @slug, CURRENT_TIMESTAMP(), @ip, @ua, @date)`,
      params: {
        id:   randomUUID(),
        slug,
        ip:   ip.substring(0, 100),
        ua:   ua.substring(0, 300),
        date: new Date().toISOString().split('T')[0],
      },
    }).catch(err => console.error('[LOG ERROR]', err.message));

    // 4. HTMLを返す（JSONなし・生データなし）
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } catch (err) {
    console.error(`[ERROR] ${slug}:`, err.message);
    return res.status(500).send(errorHtml());
  }
});

// ── ルート・その他 ─────────────────────────────────────────────
app.get('/', (_, res) => res.status(404).send(notFoundHtml()));
app.use((_, res) => res.status(404).send(notFoundHtml()));

app.listen(PORT, () => console.log(`Report server listening on :${PORT}`));

// ── エラー画面（データ非公開） ──────────────────────────────────
function notFoundHtml() {
  return minimalHtml('404', 'このページは存在しないか、アクセス権がありません。');
}
function preparingHtml(name) {
  return minimalHtml('準備中', `${name} のレポートは現在準備中です。しばらくお待ちください。`);
}
function errorHtml() {
  return minimalHtml('エラー', '一時的なエラーが発生しました。時間をおいて再度アクセスしてください。');
}
function minimalHtml(title, body) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>HEAT Report</title>
<style>body{background:#080808;color:#444;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{text-align:center;}.t{font-size:48px;font-weight:900;color:#111;margin-bottom:16px;}
.m{font-size:14px;color:#333;}</style></head>
<body><div class="box"><div class="t">${title}</div><div class="m">${body}</div></div></body></html>`;
}
