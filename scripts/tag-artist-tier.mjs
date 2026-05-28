import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const TIERS = ['emerging', 'rising', 'established', 'legend'];
const DS = 'heat_ranking';

const rawJson = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID, credentials });

function usage() {
  console.log(`
使い方:
  node tag-artist-tier.mjs --name "アーティスト名" --tier <tier> [--notes "メモ"]
  node tag-artist-tier.mjs --list

tier の種類:
  emerging    - 新人・無名
  rising      - 上昇中（B2Bレポートの主なターゲット）
  established - 有名・実績あり
  legend      - ビッグネーム（既存スポンサー・大手案件あり）

例:
  node tag-artist-tier.mjs --name "Tena Khimphun" --tier legend --notes "ABA銀行アンバサダー"
  node tag-artist-tier.mjs --name "RAKSA" --tier rising
  node tag-artist-tier.mjs --list
`);
  process.exit(1);
}

async function listArtists() {
  const [rows] = await bq.query(`
    SELECT name, name_khmer, career_tier, tier_notes, updated_at
    FROM \`${DS}.heat_artists\`
    WHERE career_tier IS NOT NULL
    ORDER BY career_tier, name
  `);

  if (rows.length === 0) {
    console.log('まだタグが付いているアーティストはいません。');
    return;
  }

  console.log('\n── タグ済みアーティスト ─────────────────────────────');
  for (const r of rows) {
    const notes = r.tier_notes ? `  ← ${r.tier_notes}` : '';
    console.log(`[${r.career_tier.toUpperCase().padEnd(11)}] ${r.name}${notes}`);
  }
  console.log('─────────────────────────────────────────────────────\n');
}

async function tagArtist(name, tier, notes) {
  if (!TIERS.includes(tier)) {
    console.error(`エラー: tier は ${TIERS.join(' | ')} のいずれかを指定してください`);
    process.exit(1);
  }

  // 対象アーティストを検索
  const [found] = await bq.query({
    query: `SELECT heat_artist_id, name FROM \`${DS}.heat_artists\`
            WHERE LOWER(name) = LOWER(@name) OR LOWER(name) LIKE LOWER(CONCAT('%', @name, '%'))
            LIMIT 5`,
    params: { name },
  });

  if (found.length === 0) {
    console.error(`「${name}」が heat_artists テーブルに見つかりません。`);
    process.exit(1);
  }

  if (found.length > 1) {
    console.log('複数候補が見つかりました。正確な名前を指定してください:');
    found.forEach(r => console.log(`  - ${r.name}`));
    process.exit(1);
  }

  const artist = found[0];
  const notesParam = notes || null;

  const updateQuery = notesParam
    ? `UPDATE \`${DS}.heat_artists\` SET career_tier = @tier, tier_notes = @notes, updated_at = CURRENT_TIMESTAMP() WHERE heat_artist_id = @id`
    : `UPDATE \`${DS}.heat_artists\` SET career_tier = @tier, updated_at = CURRENT_TIMESTAMP() WHERE heat_artist_id = @id`;

  const updateParams = notesParam
    ? { tier, notes: notesParam, id: artist.heat_artist_id }
    : { tier, id: artist.heat_artist_id };

  await bq.query({ query: updateQuery, params: updateParams });

  console.log(`✓ ${artist.name} → [${tier.toUpperCase()}]${notes ? ` (${notes})` : ''}`);
}

// ── CLI parse ─────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--list')) {
  await listArtists();
  process.exit(0);
}

const nameIdx  = args.indexOf('--name');
const tierIdx  = args.indexOf('--tier');
const notesIdx = args.indexOf('--notes');

if (nameIdx === -1 || tierIdx === -1) usage();

const name  = args[nameIdx + 1];
const tier  = args[tierIdx + 1];
const notes = notesIdx !== -1 ? args[notesIdx + 1] : null;

if (!name || !tier) usage();

await tagArtist(name, tier, notes);
