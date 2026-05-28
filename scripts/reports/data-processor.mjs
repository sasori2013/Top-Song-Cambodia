/**
 * data-processor.mjs
 *
 * BQから生データを取得し、すべての数値をシグナルに変換する。
 * このモジュールから外部に生数値は一切渡さない。
 */
import { BigQuery } from '@google-cloud/bigquery';

const DS = 'heat_ranking';

export function createBQ(credentials, projectId) {
  return new BigQuery({ projectId, credentials });
}

// ── シグナル変換関数（このファイル内にカプセル化） ───────────────

function growthSignal(pct) {
  if (pct === null) return { label: '新規エントリー', level: 'new', arrow: '★' };
  if (pct >= 200)   return { label: '急速上昇中',   level: 'hot',    arrow: '▲▲' };
  if (pct >= 80)    return { label: '上昇中',       level: 'rising', arrow: '▲' };
  if (pct >= 20)    return { label: '安定成長',     level: 'stable', arrow: '↗' };
  return              { label: '横ばい',           level: 'flat',   arrow: '→' };
}

function engagementSignal(rate) {
  if (rate >= 4)  return { label: '超高エンゲージメント', level: 'ultra' };
  if (rate >= 2)  return { label: '高エンゲージメント',   level: 'high' };
  if (rate >= 1)  return { label: '標準',               level: 'mid' };
  return            { label: '成長中',                 level: 'low' };
}

function rankSignal(current, prev) {
  if (!prev)         return { label: 'TOP ' + current + ' デビュー', delta: null, direction: 'new' };
  const delta = prev - current;
  if (delta >= 10)   return { label: `急浮上 ▲${delta}`,  delta, direction: 'up' };
  if (delta >= 3)    return { label: `上昇中 ▲${delta}`,  delta, direction: 'up' };
  if (delta >= 1)    return { label: `微上昇 ▲${delta}`,  delta, direction: 'up' };
  if (delta === 0)   return { label: '安定キープ',         delta: 0, direction: 'flat' };
  return               { label: `調整中 ▼${Math.abs(delta)}`, delta, direction: 'down' };
}

function platformSignal(spotify, appleMusic) {
  const count = (spotify ? 1 : 0) + (appleMusic ? 1 : 0);
  if (count === 2)  return { label: '全プラットフォーム展開', platforms: ['YouTube', 'Spotify', 'Apple Music'] };
  if (count === 1)  return { label: 'マルチプラットフォーム', platforms: ['YouTube', spotify ? 'Spotify' : 'Apple Music'] };
  return              { label: 'YouTube中心',              platforms: ['YouTube'] };
}

function timingSignal(growth, rankDelta, isNew) {
  if (isNew && growth === null)             return { label: '今すぐ', urgency: 'now' };
  if (growth !== null && growth >= 150)     return { label: '今すぐ', urgency: 'now' };
  if (rankDelta !== null && rankDelta >= 8) return { label: '今すぐ', urgency: 'now' };
  if (growth !== null && growth >= 50)      return { label: '検討推奨', urgency: 'soon' };
  return                                     { label: '継続観察', urgency: 'watch' };
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ── メイン取得関数 ────────────────────────────────────────────────

/**
 * 業種に応じたライジングアーティスト3名分のシグナルを返す。
 * 生数値はこの関数内で完全に消費・変換され、外部には渡さない。
 */
export async function getRisingArtistSignals(bq, industry = 'beverage') {
  const [rows] = await bq.query(`
    WITH
      lr AS (SELECT MAX(date) as d FROM \`${DS}.rank_history\` WHERE type="DAILY"),
      ls AS (SELECT MAX(date) as d FROM \`${DS}.snapshots\`),
      ps AS (
        SELECT MAX(date) as d FROM \`${DS}.snapshots\`
        WHERE date <= DATE_SUB((SELECT MAX(date) FROM \`${DS}.snapshots\`), INTERVAL 30 DAY)
      ),
      pr AS (
        SELECT MAX(date) as d FROM \`${DS}.rank_history\` WHERE type="DAILY"
        AND date <= DATE_SUB((SELECT MAX(date) FROM \`${DS}.rank_history\` WHERE type="DAILY"), INTERVAL 30 DAY)
      ),
      plat AS (
        SELECT artist, platform, MIN(rank) as best_rank
        FROM \`${DS}.platform_rankings\`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND is_khmer=TRUE
        GROUP BY artist, platform
      ),
      hist AS (
        SELECT videoId, ARRAY_AGG(rh.rank ORDER BY rh.date DESC LIMIT 14) as ranks
        FROM \`${DS}.rank_history\` rh
        WHERE rh.type="DAILY"
          AND rh.date >= DATE_SUB((SELECT MAX(date) FROM \`${DS}.rank_history\` WHERE type="DAILY"), INTERVAL 14 DAY)
        GROUP BY videoId
      )
    SELECT
      r.rank,
      s.artist,
      r.heatScore,
      snap.views            as cur_views,
      snap.likes            as cur_likes,
      snap.comments         as cur_comments,
      prev_snap.views       as prev_views,
      prev_r.rank           as prev_rank,
      s.publishedAt,
      r.videoId,
      hist.ranks            as rank_history,
      MAX(IF(p.platform="spotify",     p.best_rank, NULL)) as sp_rank,
      MAX(IF(p.platform="apple_music", p.best_rank, NULL)) as am_rank
    FROM lr, ls, ps, pr
    JOIN \`${DS}.rank_history\` r       ON r.date=lr.d AND r.type="DAILY"
    JOIN \`${DS}.songs_master\` s        ON r.videoId=s.videoId
    LEFT JOIN \`${DS}.snapshots\` snap   ON r.videoId=snap.videoId AND snap.date=ls.d
    LEFT JOIN \`${DS}.snapshots\` prev_snap ON r.videoId=prev_snap.videoId AND prev_snap.date=ps.d
    LEFT JOIN \`${DS}.rank_history\` prev_r ON r.videoId=prev_r.videoId AND prev_r.date=pr.d AND prev_r.type="DAILY"
    LEFT JOIN \`${DS}.heat_artists\` ha  ON LOWER(ha.name)=LOWER(s.artist)
    LEFT JOIN plat p                     ON LOWER(p.artist)=LOWER(s.artist)
    LEFT JOIN hist                        ON hist.videoId=r.videoId
    WHERE r.rank BETWEEN 10 AND 40
      AND (ha.career_tier IS NULL OR ha.career_tier NOT IN ("legend","established"))
    GROUP BY r.rank, s.artist, r.heatScore, snap.views, snap.likes, snap.comments,
             prev_snap.views, prev_r.rank, s.publishedAt, r.videoId, hist.ranks
    ORDER BY
      (CASE WHEN prev_r.rank IS NOT NULL THEN prev_r.rank - r.rank ELSE -1 END) DESC,
      r.heatScore DESC
    LIMIT 3
  `);

  // 生数値をここで変換 → シグナルのみ返す
  return rows.map((r, i) => {
    const curViews  = Number(r.cur_views  || 0);
    const prevViews = r.prev_views != null ? Number(r.prev_views) : null;
    const curLikes  = Number(r.cur_likes  || 0);
    const curCmnts  = Number(r.cur_comments || 0);

    const growthPct  = prevViews ? Math.round((curViews - prevViews) / prevViews * 100) : null;
    const engRate    = curViews  ? (curLikes + curCmnts) / curViews * 100 : 0;
    const rankDelta  = r.prev_rank ? Number(r.prev_rank) - Number(r.rank) : null;
    const isNew      = r.prev_rank == null;
    const age        = daysSince(r.publishedAt?.value || r.publishedAt);

    // ランク履歴をSVG用の正規化配列に変換（数値は非公開）
    const rankArr = (r.rank_history || []).map(Number);
    const sparkline = buildSparkline(rankArr);

    return {
      pickLabel:   ['#1 PICK', '#2 PICK', '#3 PICK'][i],
      artist:      r.artist,
      rank:        `TOP ${r.rank}`,
      releaseAge:  age != null ? `リリースから${age}日` : '最新リリース',
      growth:      growthSignal(growthPct),
      engagement:  engagementSignal(engRate),
      rankMovement: rankSignal(Number(r.rank), r.prev_rank ? Number(r.prev_rank) : null),
      platform:    platformSignal(r.sp_rank, r.am_rank),
      timing:      timingSignal(growthPct, rankDelta, isNew),
      sparklineSvg: sparkline,
      // 業種別コメント
      brandNote:   brandNote(industry, engRate, growthPct, rankDelta),
    };
  });
}

/** ランク履歴からSVGスパークラインを生成（数値は埋め込まない） */
function buildSparkline(ranks) {
  if (!ranks || ranks.length < 2) return '';
  const W = 120, H = 32, PAD = 2;
  const min = Math.min(...ranks), max = Math.max(...ranks);
  const range = max - min || 1;
  // 低ランク(=良い)が上に来るよう反転
  const points = ranks.map((r, i) => {
    const x = PAD + (i / (ranks.length - 1)) * (W - PAD * 2);
    const y = PAD + ((r - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const isUp = ranks[ranks.length - 1] < ranks[0]; // ランク数値が小さい=上昇
  const color = isUp ? '#00E5FF' : '#FF6B6B';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polyline points="${points}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

/** 業種別のブランドコメント生成 */
function brandNote(industry, engRate, growthPct, rankDelta) {
  if (industry === 'beverage') {
    if (engRate >= 3) return 'ファンの熱量が高く、ブランドキャンペーンへの反応率が期待できます。';
    if (growthPct !== null && growthPct >= 100) return '急速な認知拡大フェーズ。今の契約で最大の露出効果が見込めます。';
    return '安定した支持層を持つアーティスト。長期パートナーシップに適しています。';
  }
  return 'カンボジア音楽市場で注目度が高まっているアーティストです。';
}

/** マーケット概況シグナルを返す */
export async function getMarketSignals(bq) {
  const [rows] = await bq.query(`
    SELECT
      (SELECT COUNT(DISTINCT s.artist)
       FROM \`${DS}.rank_history\` r
       JOIN \`${DS}.songs_master\` s ON r.videoId=s.videoId
       WHERE r.date=(SELECT MAX(date) FROM \`${DS}.rank_history\` WHERE type="DAILY")
         AND r.type="DAILY") as charting_artists,
      (SELECT COUNT(*)
       FROM \`${DS}.platform_rankings\`
       WHERE date=(SELECT MAX(date) FROM \`${DS}.platform_rankings\`)
         AND is_khmer=TRUE AND platform="spotify") as spotify_khmer,
      (SELECT COUNT(*)
       FROM \`${DS}.platform_rankings\`
       WHERE date=(SELECT MAX(date) FROM \`${DS}.platform_rankings\`)
         AND is_khmer=TRUE AND platform="apple_music") as applemusic_khmer
  `);

  const r = rows[0] || {};
  return {
    chartingArtists: `${r.charting_artists || '—'}アーティスト`,
    spotifyPresence: r.spotify_khmer >= 10 ? '活発' : '成長中',
    appleMusicPresence: r.applemusic_khmer >= 10 ? '活発' : '成長中',
    marketMomentum: 'カンボジア音楽市場は上昇トレンドにあります',
  };
}
