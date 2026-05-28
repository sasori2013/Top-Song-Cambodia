/**
 * artists_masterのFBリンクからFacebookフォロワー数を取得し、
 * heat_artists.fb_followers に書き込む。
 *
 * Apify facebook-pages-scraper を使用（スクレイピングバンなし）
 *
 * ⚠ 手動実行専用 — 自動バッチ・cronには組み込まないこと（Apify無料枠節約）
 *
 * 使い方:
 *   node scripts/fetch-fb-followers.mjs              # 未取得 or 30日以上経過のみ
 *   node scripts/fetch-fb-followers.mjs --all        # 全件強制更新
 *   node scripts/fetch-fb-followers.mjs --dry-run    # 対象確認のみ（Apify呼ばない）
 *   node scripts/fetch-fb-followers.mjs --days 14    # N日以上未更新を対象（デフォルト30）
 */
import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DS = 'heat_ranking';
const ACTOR = 'apify~facebook-pages-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_ALL = process.argv.includes('--all');
const BATCH_SIZE = 10;
const daysIdx = process.argv.indexOf('--days');
const STALE_DAYS = daysIdx !== -1 ? parseInt(process.argv[daysIdx + 1]) : 30;

const apifyToken = (process.env.APIFY_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });

if (DRY_RUN) console.log('[DRY RUN] Apify・BQへの書き込みは行いません\n');

// ── 1. BQからFBリンク付きアーティストを取得 ──────────────────
const staleCond = FORCE_ALL
  ? 'TRUE'
  : `(ha.fb_followers IS NULL OR ha.updated_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${STALE_DAYS} DAY))`;

const [artists] = await bq.query(`
  SELECT ha.heat_artist_id, ha.name, am.facebook, ha.fb_followers, ha.updated_at
  FROM \`${DS}.heat_artists\` ha
  JOIN \`${DS}.artists_master\` am ON LOWER(ha.name) = LOWER(am.name)
  WHERE am.facebook IS NOT NULL AND am.facebook != ''
    AND ${staleCond}
  ORDER BY ha.updated_at ASC NULLS FIRST
`);

if (artists.length === 0) {
  console.log(`全アーティストが ${STALE_DAYS} 日以内に更新済みです。--all で強制実行できます。`);
  process.exit(0);
}

const mode = FORCE_ALL ? '全件強制' : `未取得 or ${STALE_DAYS}日以上未更新`;
const estimatedCost = (artists.length * 0.012).toFixed(2);
console.log(`対象: ${artists.length} アーティスト（${mode}）`);
console.log(`推定コスト: $${estimatedCost} USD（上限 $2.00）\n`);

if (DRY_RUN) {
  artists.slice(0, 5).forEach(a => console.log(`  ${a.name}  ${a.facebook}`));
  if (artists.length > 5) console.log(`  ...他 ${artists.length - 5} 件`);
  process.exit(0);
}

if (parseFloat(estimatedCost) > 2.0) {
  console.error(`⚠ 推定コストが $2.00 を超えます。--days を増やして対象を絞るか、分割実行してください。`);
  process.exit(1);
}

// ── 2. Apify でバッチ取得 ─────────────────────────────────────
async function fetchFollowersBatch(urls) {
  const res = await fetch(
    `${APIFY_BASE}/acts/${ACTOR}/run-sync-get-dataset-items?token=${apifyToken}&timeout=120`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: urls.map(u => ({ url: u })) }),
    }
  );
  if (!res.ok) throw new Error(`Apify error: ${res.status} — ${await res.text()}`);
  return res.json();
}

// URLをアーティストにマッピング
function normalizeUrl(url) {
  return url.replace(/^https?:\/\/(web\.)?facebook\.com\//, '').replace(/\/$/, '').toLowerCase();
}

const urlToArtist = new Map();
for (const a of artists) {
  urlToArtist.set(normalizeUrl(a.facebook), a);
}

// バッチ処理
let updated = 0, failed = 0;
const fbUrls = artists.map(a => a.facebook);

for (let i = 0; i < fbUrls.length; i += BATCH_SIZE) {
  const batch = fbUrls.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(fbUrls.length / BATCH_SIZE);

  console.log(`バッチ ${batchNum}/${totalBatches}: ${batch.length}件取得中...`);

  let items;
  try {
    items = await fetchFollowersBatch(batch);
  } catch (err) {
    console.error(`  ✗ バッチ失敗: ${err.message}`);
    failed += batch.length;
    continue;
  }

  for (const item of items) {
    const key = normalizeUrl(item.url || '');
    const artist = urlToArtist.get(key);
    const followers = item.followers ?? item.likes ?? null;

    if (!artist) {
      // URLが変形している場合に名前で再マッチ
      const byTitle = artists.find(a =>
        item.title && a.name.toLowerCase().includes(item.title.split(' ')[0].toLowerCase())
      );
      if (!byTitle || !followers) continue;
      console.log(`  ? ${byTitle.name}: ${followers.toLocaleString()} フォロワー (タイトルマッチ)`);
      if (!DRY_RUN) await updateBQ(byTitle.heat_artist_id, followers);
      updated++;
      continue;
    }

    if (followers === null) {
      console.log(`  ⚠ ${artist.name}: フォロワー数が取得できませんでした`);
      failed++;
      continue;
    }

    console.log(`  ✓ ${artist.name}: ${followers.toLocaleString()} フォロワー`);
    if (!DRY_RUN) await updateBQ(artist.heat_artist_id, followers);
    updated++;
  }
}

async function updateBQ(id, followers) {
  await bq.query({
    query: `UPDATE \`${DS}.heat_artists\`
            SET fb_followers = @followers, updated_at = CURRENT_TIMESTAMP()
            WHERE heat_artist_id = @id`,
    params: { followers, id },
    types: { followers: 'INT64', id: 'STRING' },
  });
}

console.log(`\n完了: ${updated}件更新 / ${failed}件失敗`);
