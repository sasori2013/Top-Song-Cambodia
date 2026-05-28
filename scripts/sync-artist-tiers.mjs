/**
 * Artistsシート（P列: Tier、Q列: TikTok URL）と
 * Label_Roster（F列: Tier）を読み取り、
 * BigQuery heat_artists に同期する。
 *
 * 使い方:
 *   node scripts/sync-artist-tiers.mjs           # 全件同期
 *   node scripts/sync-artist-tiers.mjs --dry-run # 確認のみ（書き込みなし）
 */
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const TIERS = new Set(['emerging', 'rising', 'established', 'legend']);
const DS = 'heat_ranking';
const DRY_RUN = process.argv.includes('--dry-run');

const credentials = JSON.parse((process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });

if (DRY_RUN) console.log('[DRY RUN] BQへの書き込みは行いません\n');

// ── シートからデータ収集 ───────────────────────────────────────

// Artists: A=name P=tier Q=tiktok
const artistsRes = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
  range: 'Artists!A2:Q',
});
const artistRows = (artistsRes.data.values || []).filter(r => r[0]);

// Label_Roster: B=name F=tier
const rosterRes = await sheets.spreadsheets.values.get({
  spreadsheetId: process.env.NEXT_PUBLIC_SHEET_ID,
  range: 'Label_Roster!B2:F',
});
const rosterRows = (rosterRes.data.values || []).filter(r => r[0]);

// Tier マップ（Label_Roster優先）
const tierMap = new Map();
for (const r of artistRows) {
  const name = r[0]?.trim();
  const tier = r[15]?.trim()?.toLowerCase();
  if (name && tier && TIERS.has(tier)) tierMap.set(name.toLowerCase(), { name, tier, source: 'Artists' });
}
for (const r of rosterRows) {
  const name = r[0]?.trim();
  const tier = r[4]?.trim()?.toLowerCase();
  if (name && tier && TIERS.has(tier)) tierMap.set(name.toLowerCase(), { name, tier, source: 'Label_Roster' });
}

// TikTok URLマップ
const tiktokMap = new Map();
for (const r of artistRows) {
  const name = r[0]?.trim();
  const url  = r[16]?.trim(); // Q列
  if (name && url) tiktokMap.set(name.toLowerCase(), { name, url });
}

// ── サマリー表示 ───────────────────────────────────────────────

console.log(`Tier設定:    ${tierMap.size} 件`);
console.log(`TikTok URL:  ${tiktokMap.size} 件\n`);

if (tierMap.size > 0) {
  console.log('── Tier ──────────────────────────────────');
  for (const { name, tier, source } of tierMap.values())
    console.log(`  [${tier.toUpperCase().padEnd(11)}] ${name}  (${source})`);
}
if (tiktokMap.size > 0) {
  console.log('\n── TikTok URL ────────────────────────────');
  for (const { name, url } of tiktokMap.values())
    console.log(`  ${name}: ${url}`);
}
console.log('');

if (DRY_RUN) process.exit(0);

// ── BQに反映 ──────────────────────────────────────────────────

let updated = 0, skipped = 0;

// 全ユニーク名を収集
const allNames = new Set([...tierMap.keys(), ...tiktokMap.keys()]);

for (const key of allNames) {
  const tierEntry   = tierMap.get(key);
  const tiktokEntry = tiktokMap.get(key);
  const name        = tierEntry?.name || tiktokEntry?.name;

  const [found] = await bq.query({
    query: `SELECT heat_artist_id, name, career_tier, tiktok_url
            FROM \`${DS}.heat_artists\`
            WHERE LOWER(name) = LOWER(@name) LIMIT 1`,
    params: { name },
  });

  if (found.length === 0) {
    console.log(`  ⚠ 未登録: ${name}`);
    skipped++;
    continue;
  }

  const artist = found[0];
  const newTier   = tierEntry?.tier    ?? artist.career_tier;
  const newTiktok = tiktokEntry?.url   ?? artist.tiktok_url;

  const tierChanged   = tierEntry   && artist.career_tier !== newTier;
  const tiktokChanged = tiktokEntry && artist.tiktok_url  !== newTiktok;

  if (!tierChanged && !tiktokChanged) {
    console.log(`  - スキップ: ${artist.name}`);
    skipped++;
    continue;
  }

  const setParts = [];
  const params = { id: artist.heat_artist_id };
  if (tierChanged)   { setParts.push('career_tier = @tier');    params.tier    = newTier; }
  if (tiktokChanged) { setParts.push('tiktok_url  = @tiktok');  params.tiktok  = newTiktok; }
  setParts.push('updated_at = CURRENT_TIMESTAMP()');

  await bq.query({
    query: `UPDATE \`${DS}.heat_artists\` SET ${setParts.join(', ')} WHERE heat_artist_id = @id`,
    params,
  });

  const changes = [
    tierChanged   ? `tier → [${newTier.toUpperCase()}]` : null,
    tiktokChanged ? `tiktok → ${newTiktok}` : null,
  ].filter(Boolean).join('  ');

  console.log(`  ✓ ${artist.name}: ${changes}`);
  updated++;
}

console.log(`\n完了: ${updated}件更新 / ${skipped}件スキップ`);
