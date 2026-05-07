/**
 * Monthly Cambodia YouTube Trends — Sponsor Report Pipeline
 *
 * 目的: スポンサーへの提案資料として、全州×全アーティストの人気マトリクスを生成する
 *
 * アルゴリズム:
 *   1. BQ から篩にかけたアーティスト最大99名を取得（複合スコア順）
 *   2. #1アーティストをアンカーとして全バッチに含め、GEO_MAP を25回実行
 *   3. アンカー基準でスコアを正規化 → バッチ間比較を可能に
 *   4. 各州のアーティスト順位を算出
 *   5. BQ + Google Sheets（スポンサー共有用）に書き出し
 *
 * API コスト: 25回/月（無料枠100回の25%）
 */

import { BigQuery }  from '@google-cloud/bigquery';
import { google }    from 'googleapis';
import dotenv        from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

// ── 設定 ────────────────────────────────────────────────────────────────────
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const PROJECT_ID  = process.env.GCP_PROJECT_ID;
const SHEET_ID    = process.env.NEXT_PUBLIC_SHEET_ID;
const DATASET     = 'heat_ranking';
const BATCH_SIZE  = 4;   // アンカー+4名 = 5クエリ（Google Trends上限）
const SLEEP_MS    = 2500;
const MAX_ARTISTS = 99;  // アンカー含めて100、SerpApiは25コール

const GEO_TO_NAME = {
  'KH-1':  { id: 'banteay_meanchey', name: 'Banteay Meanchey' },
  'KH-2':  { id: 'battambang',       name: 'Battambang'       },
  'KH-3':  { id: 'kampong_cham',     name: 'Kampong Cham'     },
  'KH-4':  { id: 'kampong_chhnang',  name: 'Kampong Chhnang'  },
  'KH-5':  { id: 'kampong_speu',     name: 'Kampong Speu'     },
  'KH-6':  { id: 'kampong_thom',     name: 'Kampong Thom'     },
  'KH-7':  { id: 'kampot',           name: 'Kampot'           },
  'KH-8':  { id: 'kandal',           name: 'Kandal'           },
  'KH-9':  { id: 'koh_kong',         name: 'Koh Kong'         },
  'KH-10': { id: 'kratie',           name: 'Kratie'           },
  'KH-11': { id: 'mondulkiri',       name: 'Mondulkiri'       },
  'KH-12': { id: 'phnom_penh',       name: 'Phnom Penh'       },
  'KH-13': { id: 'preah_vihear',     name: 'Preah Vihear'     },
  'KH-14': { id: 'prey_veng',        name: 'Prey Veng'        },
  'KH-15': { id: 'pursat',           name: 'Pursat'           },
  'KH-16': { id: 'ratanakiri',       name: 'Ratanakiri'       },
  'KH-17': { id: 'siem_reap',        name: 'Siem Reap'        },
  'KH-18': { id: 'preah_sihanouk',   name: 'Preah Sihanouk'   },
  'KH-19': { id: 'stung_treng',      name: 'Stung Treng'      },
  'KH-20': { id: 'svay_rieng',       name: 'Svay Rieng'       },
  'KH-21': { id: 'takeo',            name: 'Takeo'            },
  'KH-22': { id: 'oddar_meanchey',   name: 'Oddar Meanchey'   },
  'KH-23': { id: 'kep',              name: 'Kep'              },
  'KH-24': { id: 'pailin',           name: 'Pailin'           },
  'KH-25': { id: 'tbong_khmum',      name: 'Tbong Khmum'      },
};

// ── クライアント初期化 ───────────────────────────────────────────────────────
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const creds   = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials: creds });

const auth   = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Telegram 通知 ────────────────────────────────────────────────────────────
async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.warn('⚠️  Telegram env missing, skip'); return; }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.warn('⚠️  Telegram send failed:', res.status);
  } catch (e) {
    console.warn('⚠️  Telegram error:', e.message);
  }
}

// ── SerpApi GEO_MAP ──────────────────────────────────────────────────────────
async function fetchGeoMap(queries) {
  const p = new URLSearchParams({
    engine: 'google_trends',
    q: queries.join(','),
    geo: 'KH',
    gprop: 'youtube',
    data_type: 'GEO_MAP',
    api_key: SERPAPI_KEY,
  });
  const res  = await fetch(`https://serpapi.com/search.json?${p}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.compared_breakdown_by_region || [];
}

// ── BQ: 篩済みアーティスト取得 ───────────────────────────────────────────────
async function getScoredArtists() {
  const [rows] = await bq.query(`
    WITH
    -- プロダクション名を除外したアーティスト一覧
    -- artists_master: type='Artist' のみ（P=プロダクションは除外済み）
    -- label_roster: artists_master で type='Artist' と確認できるもの、または未登録の名前のみ
    -- productionName='P' = プロダクション会社本体 → 除外
    production_names AS (
      SELECT name FROM \`${PROJECT_ID}.${DATASET}.artists_master\`
      WHERE productionName = 'P' AND name IS NOT NULL
    ),
    all_artists AS (
      SELECT DISTINCT name AS artist FROM \`${PROJECT_ID}.${DATASET}.artists_master\`
      WHERE type = 'Artist'
        AND name IS NOT NULL AND name != ''
        AND COALESCE(productionName, '') != 'P'
      UNION DISTINCT
      SELECT DISTINCT targetArtist AS artist FROM \`${PROJECT_ID}.${DATASET}.label_roster\`
      WHERE targetArtist IS NOT NULL AND targetArtist != ''
        AND targetArtist NOT IN (SELECT name FROM production_names)
    ),
    recent_releases AS (
      SELECT artist, COUNT(*) AS song_count_90d
      FROM \`${PROJECT_ID}.${DATASET}.songs_master\`
      WHERE DATE(publishedAt) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
      GROUP BY artist
    ),
    ranking_stats AS (
      SELECT s.artist, COUNT(*) AS rank_appearances, AVG(r.heatScore) AS avg_heat
      FROM \`${PROJECT_ID}.${DATASET}.rank_history\` r
      JOIN \`${PROJECT_ID}.${DATASET}.songs_master\` s ON r.videoId = s.videoId
      WHERE r.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND r.type = 'DAILY'
      GROUP BY s.artist
    ),
    subs AS (
      SELECT name, COALESCE(subscribers, 0) AS subscribers
      FROM \`${PROJECT_ID}.${DATASET}.artists_master\` WHERE name IS NOT NULL
    ),
    scored AS (
      SELECT a.artist,
        (
          0.40 * LEAST(COALESCE(rs.rank_appearances, 0) / 30.0, 1.0) * 100
          + 0.30 * LEAST(LN(GREATEST(COALESCE(sd.subscribers, 0), 1)) / LN(1000000), 1.0) * 100
          + 0.20 * IF(COALESCE(rr.song_count_90d, 0) > 0, 100, 0)
          + 0.10 * LEAST(COALESCE(rs.avg_heat, 0) / 100.0, 1.0) * 100
        ) AS composite_score
      FROM all_artists a
      LEFT JOIN recent_releases rr ON a.artist = rr.artist
      LEFT JOIN ranking_stats   rs ON a.artist = rs.artist
      LEFT JOIN subs            sd ON a.artist = sd.name
      WHERE COALESCE(rr.song_count_90d, 0) > 0 OR COALESCE(rs.rank_appearances, 0) > 0
    )
    SELECT artist FROM scored ORDER BY composite_score DESC LIMIT ${MAX_ARTISTS}
  `);
  return rows.map(r => r.artist);
}

// ── BQ: テーブル確保 ─────────────────────────────────────────────────────────
async function ensureTables() {
  const dataset = bq.dataset(DATASET);
  const tables = {
    trends_score_matrix: [
      { name: 'run_date',      type: 'DATE'    },
      { name: 'province_id',   type: 'STRING'  },
      { name: 'province_name', type: 'STRING'  },
      { name: 'artist_name',   type: 'STRING'  },
      { name: 'score',         type: 'FLOAT64' }, // アンカー基準の正規化スコア
      { name: 'province_rank', type: 'INTEGER' }, // この州での順位
    ],
  };
  for (const [tbl, schema] of Object.entries(tables)) {
    try {
      await dataset.table(tbl).getMetadata();
    } catch {
      await dataset.createTable(tbl, { schema });
      console.log(`  Created table: ${tbl}`);
    }
  }
}

// ── Google Sheets ヘルパー ───────────────────────────────────────────────────
async function ensureTab(spreadsheetId, title, existingTabs) {
  if (!existingTabs.includes(title)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }
}

async function writeTab(spreadsheetId, title, values) {
  // まず既存データを全消去してから書き込む
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${title}'!A:ZZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${title}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

// ── Google Sheets 書き出し ───────────────────────────────────────────────────
async function writeToSheets(runDate, matrix, provinceRankings) {
  const TOP_N    = 10;
  const artists  = [...new Set(matrix.map(r => r.artist_name))];
  const provNames = provinceRankings.map(p => p.province_name);

  // 全国スコア = 各州スコアの平均
  const nationalAvg = artists.map(artist => {
    const scores = matrix.filter(r => r.artist_name === artist).map(r => r.score);
    const avg    = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    return { artist, avg };
  }).sort((a, b) => b.avg - a.avg);

  // 州別ランキング行データ（再利用）
  const rankingHeader = ['州', ...Array.from({ length: TOP_N }, (_, i) => [`#${i+1}`, 'スコア']).flat()];
  const rankingRows   = provinceRankings.map(prov => {
    const top   = prov.artists.slice(0, TOP_N);
    const cells = [prov.province_name];
    for (let i = 0; i < TOP_N; i++) {
      cells.push(top[i]?.artist ?? '', top[i] ? Math.round(top[i].score) : '');
    }
    return cells;
  });

  // マトリクス行データ（再利用）
  const matrixHeader = ['アーティスト', '全国平均', ...provNames];
  const matrixRows   = nationalAvg.map(({ artist, avg }) => {
    const byProv = provinceRankings.map(prov => {
      const hit = prov.artists.find(a => a.artist === artist);
      return hit ? Math.round(hit.score) : 0;
    });
    return [artist, Math.round(avg), ...byProv];
  });

  const spreadsheet  = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = spreadsheet.data.sheets.map(s => s.properties.title);

  // ── ① 最新データのみ表示（固定タブ・毎回上書き） ──────────────────────────
  const LATEST_RANKING = '📊 州別ランキング【最新】';
  const LATEST_MATRIX  = '📊 マトリクス【最新】';

  for (const title of [LATEST_RANKING, LATEST_MATRIX]) {
    await ensureTab(SHEET_ID, title, existingTabs);
  }

  // 最新タブ: 州別ランキング（先頭行に更新日を追加）
  await writeTab(SHEET_ID, LATEST_RANKING, [
    [`最終更新: ${runDate}`, '', `対象アーティスト: ${artists.length}名`, '', `対象州: ${provinceRankings.filter(p => p.artists.length).length}州`],
    [],
    rankingHeader,
    ...rankingRows,
  ]);
  console.log(`  ✅ "${LATEST_RANKING}" updated`);

  // 最新タブ: マトリクス
  await writeTab(SHEET_ID, LATEST_MATRIX, [
    [`最終更新: ${runDate}`, '', `スコアはVannDa基準（=100）の相対値`],
    [],
    matrixHeader,
    ...matrixRows,
  ]);
  console.log(`  ✅ "${LATEST_MATRIX}" updated`);

  // ── ② 履歴タブ（日付付き・追記のみ、上書きしない） ─────────────────────
  const HIST_RANKING = `州別ランキング ${runDate.slice(0, 7)}`;
  const HIST_MATRIX  = `マトリクス ${runDate.slice(0, 7)}`;

  for (const [title, header, rows] of [
    [HIST_RANKING, rankingHeader, rankingRows],
    [HIST_MATRIX,  matrixHeader,  matrixRows ],
  ]) {
    await ensureTab(SHEET_ID, title, existingTabs);
    await writeTab(SHEET_ID, title, [
      [`更新日: ${runDate}`],
      [],
      header,
      ...rows,
    ]);
    console.log(`  📁 "${title}" saved`);
  }
}

// ── メイン ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Monthly Cambodia Trends — Sponsor Report ===');
  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`Run date: ${runDate}`);

  if (!SERPAPI_KEY) { console.error('❌ SERPAPI_KEY missing'); process.exit(1); }

  await ensureTables();

  // 1. アーティスト一覧取得
  const artists = await getScoredArtists();
  const anchor  = artists[0]; // 複合スコア#1をアンカーに
  const rest    = artists.slice(1);
  console.log(`\n[1] 対象: ${artists.length}名 / アンカー: "${anchor}"`);

  // 2. バッチ GEO_MAP
  // score[provinceId][artistName] = normalized score (anchor=100基準)
  const score = {};
  Object.values(GEO_TO_NAME).forEach(p => { score[p.id] = {}; });

  const batches = [];
  for (let i = 0; i < rest.length; i += BATCH_SIZE) {
    batches.push([anchor, ...rest.slice(i, i + BATCH_SIZE)]);
  }
  console.log(`\n[2] GEO_MAP バッチ: ${batches.length}回`);

  let apiCalls = 0;
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    process.stdout.write(`  Batch ${bi + 1}/${batches.length} [${batch.join(', ')}] → `);
    try {
      const regions = await fetchGeoMap(batch);
      apiCalls++;

      for (const region of regions) {
        const prov = GEO_TO_NAME[region.geo];
        if (!prov) continue;
        const pid = prov.id;

        // アンカーのこのバッチでの値
        const anchorVal = (region.values.find(v => v.query === anchor)?.extracted_value) ?? 0;
        if (anchorVal === 0) continue; // アンカーが0の州はデータ信頼性低いのでスキップ

        for (const v of region.values) {
          if (v.query === anchor) {
            score[pid][anchor] = 100; // アンカー = 定義上100
          } else {
            // 正規化: このアーティストのスコア / アンカーのスコア × 100
            const normalized = Math.round((v.extracted_value / anchorVal) * 100);
            // 既存値があれば最大値を採用（複数バッチで同じ州が出た場合は通常ない）
            score[pid][v.query] = Math.max(score[pid][v.query] ?? 0, normalized);
          }
        }
      }
      console.log(`${regions.length}州`);
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }

    if (bi < batches.length - 1) await sleep(SLEEP_MS);
  }
  console.log(`  合計 ${apiCalls} API コール使用`);

  // 3. 州ごとにランキング生成
  const provinceRankings = Object.entries(GEO_TO_NAME).map(([geo, prov]) => {
    const artistScores = Object.entries(score[prov.id] || {})
      .map(([artist, s]) => ({ artist, score: s }))
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((a, i) => ({ ...a, rank: i + 1 }));
    return { geo, province_id: prov.id, province_name: prov.name, artists: artistScores };
  });

  // 4. BQ 書き込み（同日の再実行のみ上書き、他の履歴は保持）
  console.log('\n[3] BigQuery 書き込み...');
  console.log(`  DELETE 実行: run_date = ${runDate}`);
  await bq.query(`DELETE FROM \`${PROJECT_ID}.${DATASET}.trends_score_matrix\` WHERE FORMAT_DATE('%Y-%m-%d', run_date) = '${runDate}'`);
  console.log(`  DELETE 完了`);

  const bqRows = [];
  for (const prov of provinceRankings) {
    for (const a of prov.artists) {
      bqRows.push({
        run_date:      runDate,
        province_id:   prov.province_id,
        province_name: prov.province_name,
        artist_name:   a.artist,
        score:         a.score,
        province_rank: a.rank,
      });
    }
  }
  if (bqRows.length > 0) {
    try {
      await bq.dataset(DATASET).table('trends_score_matrix').insert(bqRows);
      console.log(`  ${bqRows.length}行 挿入完了`);
    } catch (insertErr) {
      if (insertErr.name === 'PartialFailureError') {
        console.error('  PartialFailureError:', JSON.stringify(insertErr.errors?.slice(0, 3), null, 2));
      }
      throw insertErr;
    }
  }

  // 5. Google Sheets 書き込み
  console.log('\n[4] Google Sheets 書き込み...');
  await writeToSheets(runDate, bqRows, provinceRankings);

  // 6. サマリー & Telegram 成功通知
  const activeProv = provinceRankings.filter(p => p.artists.length > 0);
  console.log('\n✅ 完了');
  console.log(`   API コール: ${apiCalls}/${batches.length} (${Math.round(apiCalls/100*100)}% of free tier)`);
  console.log(`   アーティスト: ${artists.length}名 × 州: ${activeProv.length}州`);
  console.log(`   Sheets: ${SHEET_ID}`);
  console.log('\n--- 州別 Top3 プレビュー ---');
  activeProv.forEach(p => {
    const top3 = p.artists.slice(0, 3).map((a, i) => `#${i+1} ${a.artist}(${a.score})`).join('  ');
    console.log(`  ${p.province_name.padEnd(20)} ${top3}`);
  });

  // 全国Top3テキスト
  const allScores = {};
  for (const prov of activeProv) {
    for (const a of prov.artists) {
      allScores[a.artist] = (allScores[a.artist] ?? []);
      allScores[a.artist].push(a.score);
    }
  }
  const national = Object.entries(allScores)
    .map(([artist, scores]) => ({ artist, avg: scores.reduce((s, v) => s + v, 0) / scores.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
  const top3Text = national.map((a, i) => `${i+1}. ${a.artist} (${Math.round(a.avg)})`).join('\n');

  await sendTelegram(
    `🎵 <b>Cambodia Trends 完了</b> [${runDate}]\n\n` +
    `📊 ${artists.length}名 × ${activeProv.length}州\n` +
    `🔗 APIコール: ${apiCalls}回\n\n` +
    `🏆 全国Top3:\n${top3Text}\n\n` +
    `📋 Sheets更新済み`
  );
}

main().catch(async e => {
  const detail = e.errors ? JSON.stringify(e.errors, null, 2) : (e.stack || e.message || String(e));
  console.error('❌ Fatal:', e.message || '(no message)');
  console.error('Detail:', detail);
  await sendTelegram(
    `❌ <b>Cambodia Trends 失敗</b>\n\n` +
    `エラー: ${e.message || String(e)}\n` +
    `日時: ${new Date().toISOString()}`
  );
  process.exit(1);
});
