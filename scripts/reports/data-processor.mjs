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

function velocitySignal(score) {
  if (score == null) return { label: 'データ不足', level: 'none',    score: null };
  const s = Math.round(score);
  if (s >= 200) return { label: 'ロケット加速', level: 'rocket',  score: s };
  if (s >= 80)  return { label: '急加速',       level: 'hot',     score: s };
  if (s >= 20)  return { label: '加速中',        level: 'rising',  score: s };
  if (s >= -20) return { label: '横ばい',        level: 'flat',    score: s };
  return           { label: '失速中',           level: 'falling', score: s };
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
      ),
      -- ── Velocity 200: アーティスト全楽曲合算のエンゲージメント加速度 ──
      vel AS (
        SELECT
          sm.artist,
          -- e0: アーティスト全楽曲の今日の日次増分
          COALESCE(SUM(IF(sn.date=d0,                              sn.likes+sn.comments, 0)),0) -
          COALESCE(SUM(IF(sn.date=DATE_SUB(d0, INTERVAL 1 DAY),   sn.likes+sn.comments, 0)),0) AS e0,
          -- e1: 前日の日次増分
          COALESCE(SUM(IF(sn.date=DATE_SUB(d0, INTERVAL 1 DAY),   sn.likes+sn.comments, 0)),0) -
          COALESCE(SUM(IF(sn.date=DATE_SUB(d0, INTERVAL 2 DAY),   sn.likes+sn.comments, 0)),0) AS e1,
          -- e_bar: 過去7日間の日次平均（望遠鏡公式）
          (COALESCE(SUM(IF(sn.date=DATE_SUB(d0, INTERVAL 1 DAY),  sn.likes+sn.comments, 0)),0) -
           COALESCE(SUM(IF(sn.date=DATE_SUB(d0, INTERVAL 8 DAY),  sn.likes+sn.comments, 0)),0)) / 7.0 AS e_bar
        FROM \`${DS}.snapshots\` sn
        JOIN \`${DS}.songs_master\` sm ON sn.videoId = sm.videoId
        CROSS JOIN (SELECT MAX(date) AS d0 FROM \`${DS}.snapshots\`) AS latest
        WHERE sn.date IN (d0,
                          DATE_SUB(d0, INTERVAL 1 DAY),
                          DATE_SUB(d0, INTERVAL 2 DAY),
                          DATE_SUB(d0, INTERVAL 8 DAY))
        GROUP BY sm.artist
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
      MAX(IF(p.platform="apple_music", p.best_rank, NULL)) as am_rank,
      -- Velocity 200スコア（生数値は変換後に破棄）
      SAFE_DIVIDE(
        vel.e0 - vel.e1,
        GREATEST(ABS(vel.e1), 0.05 * (vel.e_bar + 50))
      ) * 100 AS velocity_200
    FROM lr, ls, ps, pr
    JOIN \`${DS}.rank_history\` r       ON r.date=lr.d AND r.type="DAILY"
    JOIN \`${DS}.songs_master\` s        ON r.videoId=s.videoId
    LEFT JOIN \`${DS}.snapshots\` snap   ON r.videoId=snap.videoId AND snap.date=ls.d
    LEFT JOIN \`${DS}.snapshots\` prev_snap ON r.videoId=prev_snap.videoId AND prev_snap.date=ps.d
    LEFT JOIN \`${DS}.rank_history\` prev_r ON r.videoId=prev_r.videoId AND prev_r.date=pr.d AND prev_r.type="DAILY"
    LEFT JOIN \`${DS}.heat_artists\` ha  ON LOWER(ha.name)=LOWER(s.artist)
    LEFT JOIN plat p                     ON LOWER(p.artist)=LOWER(s.artist)
    LEFT JOIN hist                        ON hist.videoId=r.videoId
    LEFT JOIN vel                         ON LOWER(vel.artist)=LOWER(s.artist)
    WHERE r.rank BETWEEN 10 AND 40
      AND (ha.career_tier IS NULL OR ha.career_tier NOT IN ("legend","established"))
    GROUP BY r.rank, s.artist, r.heatScore, snap.views, snap.likes, snap.comments,
             prev_snap.views, prev_r.rank, s.publishedAt, r.videoId, hist.ranks,
             vel.e0, vel.e1, vel.e_bar
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

    const rawVelocity    = r.velocity_200 != null ? Number(r.velocity_200) : null;
    const growth         = growthSignal(growthPct);
    const engagement     = engagementSignal(engRate);
    const rankMovement   = rankSignal(Number(r.rank), r.prev_rank ? Number(r.prev_rank) : null);
    const platform       = platformSignal(r.sp_rank, r.am_rank);
    const timing         = timingSignal(growthPct, rankDelta, isNew);
    const velocity       = velocitySignal(rawVelocity);
    const narrative      = buildNarrative(
      growth.level, engagement.level, rankMovement.direction,
      rankDelta, isNew, platform.platforms.length, industry,
    );
    const platformProfile = buildPlatformProfile(
      Number(r.rank), growth.level, engRate,
      r.sp_rank ? Number(r.sp_rank) : null,
      r.am_rank ? Number(r.am_rank) : null,
    );

    return {
      pickLabel:    ['#1 PICK', '#2 PICK', '#3 PICK'][i],
      artist:       r.artist,
      videoId:      r.videoId,
      rank:         `TOP ${r.rank}`,
      releaseAge:   age != null ? `リリースから${age}日` : '最新リリース',
      growth,
      engagement,
      rankMovement,
      platform,
      timing,
      velocity,
      sparklineSvg: sparkline,
      narrative,
      platformProfile,
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
  const color = isUp ? '#1A6EBD' : '#C0392B';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polyline points="${points}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
}

/**
 * 各プラットフォームでの立ち位置と、それが示すオーディエンス像を返す。
 * 生のランク数値は外部に渡さず、強度レベルのみに変換する。
 */
function buildPlatformProfile(rank, growthLevel, engRate, spRank, amRank) {
  const ytStrength = rank <= 15 ? 'strong' : rank <= 28 ? 'mid' : 'rising';

  const platforms = [
    {
      name: 'YouTube',
      color: '#E53935',
      status: ytStrength === 'strong' ? 'チャート上位' : ytStrength === 'mid' ? 'チャートイン' : '上昇中',
      active: true,
      audience: 'カンボジア国内の幅広い年齢層（13〜35歳）にリーチ。動画視聴が主な消費行動であり、認知形成の最大チャネル。',
      brandFit: ytStrength === 'strong'
        ? '高い露出量が見込め、マス向けキャンペーンの主軸として機能する。'
        : 'チャートイン中のタイミングであり、認知拡大フェーズのブランド連動に適している。',
    },
    {
      name: 'Spotify',
      color: '#1DB954',
      status: spRank ? 'チャートイン' : '未展開',
      active: !!spRank,
      audience: spRank
        ? '月額課金の音楽ストリーミングユーザー。可処分所得が高いミドル〜アッパー層が中心で、ブランドへの信頼感が高い消費者層。'
        : '現時点ではSpotifyへの展開なし。ストリーミング課金層へのリーチは限定的。',
      brandFit: spRank
        ? 'プレミアム・ライフスタイル系ブランドとの親和性が高い。高関与ファン層への精度の高いリーチが可能。'
        : null,
    },
    {
      name: 'Apple Music',
      color: '#FF6690',
      status: amRank ? 'チャートイン' : '未展開',
      active: !!amRank,
      audience: amRank
        ? 'iPhoneユーザー層。東南アジアでは所得上位層と相関が強く、ライフスタイル・高級ブランドへの感度が高い。'
        : '現時点ではApple Musicへの展開なし。',
      brandFit: amRank
        ? 'ラグジュアリー・プレミアムブランドとの相性が最も高いオーディエンス。購買力の高い層への訴求に有効。'
        : null,
    },
    {
      name: 'Facebook',
      color: '#1877F2',
      status: 'データ収集中',
      active: false,
      audience: '25〜45歳の購買力のある社会人層に強い。コミュニティ形成とブランドの長期露出に有効なチャネル。',
      brandFit: 'ブランドとの継続的な関係構築に適している。（実データ統合後に評価更新予定）',
    },
    {
      name: 'TikTok',
      color: '#00C2CB',
      status: 'データ収集中',
      active: false,
      audience: 'Z世代（15〜25歳）のバイラル拡散に特化。短期間での認知爆発と新規ファン獲得に強い。',
      brandFit: 'トレンド感・話題性を重視するキャンペーンに最適。（実データ統合後に評価更新予定）',
    },
  ];

  // ── 総合パワープロファイルの合成 ──
  const hasSpotify   = !!spRank;
  const hasApple     = !!amRank;
  const hasBoth      = hasSpotify && hasApple;
  const hasStreaming  = hasSpotify || hasApple;
  const isHighEng    = engRate >= 2;

  let powerProfile;
  if (hasBoth && ytStrength === 'strong' && isHighEng) {
    powerProfile = {
      type:  'プレミアム×マス完全両立型',
      color: '#1A6EBD',
      desc:  'YouTube・Spotify・Apple Musicの全方位で強い存在感を持ち、かつファンの熱量も高い。マス認知とプレミアム層への浸透を同時に実現できる希少なポジション。高級ブランドから生活消費財まで幅広い業種のフラッグシップ契約に適している。',
    };
  } else if (hasBoth && ytStrength === 'strong') {
    powerProfile = {
      type:  'マス×プレミアム両立型',
      color: '#1A6EBD',
      desc:  'YouTubeでのマス認知とSpotify・Apple Musicでのプレミアム層浸透を兼ね備える。ブランドキャンペーンの幅が広く、ターゲットを選ばない汎用性の高いアーティスト。',
    };
  } else if (hasBoth) {
    powerProfile = {
      type:  'ストリーミング特化型（高関与層）',
      color: '#1A7A4A',
      desc:  'Spotify・Apple Music両方でチャートイン。音楽に対して課金するほど関与度の高い消費者層に強くリーチできる。プレミアム・ライフスタイル・金融・旅行系ブランドとの相性が特に高い。',
    };
  } else if (hasStreaming && ytStrength === 'strong') {
    powerProfile = {
      type:  '認知×プレミアム成長型',
      color: '#1A7A4A',
      desc:  'YouTubeで幅広い認知を持ちつつ、ストリーミングプラットフォームでの浸透が進んでいる成長期のアーティスト。マス向けキャンペーンとプレミアム訴求の両軸で展開できる。',
    };
  } else if (hasStreaming) {
    powerProfile = {
      type:  'コアファン型',
      color: '#B7770D',
      desc:  'ストリーミングでの存在感は音楽への深い関与を示す。ファンは熱量が高く、ブランドへの信頼転移が起きやすい層。限定コラボや特定コミュニティへの精度の高い訴求に向く。',
    };
  } else {
    powerProfile = {
      type:  'YouTube集中型（マスリーチ）',
      color: '#888',
      desc:  'カンボジア最大の動画プラットフォームで認知を形成中。幅広い年齢層への露出と短期間での認知拡大に強い。現時点では課金層よりも広義のマス層へのリーチが主体。',
    };
  }

  return { platforms, powerProfile };
}

/**
 * シグナルの組み合わせからビジネス論拠のナラティブを生成する。
 * growthLevel, engLevel, rankDir, rankDelta, isNew, platformCount, industry を受け取り、
 * 3つのセクション（状況・ブランド旨味・タイミング根拠）を返す。
 */
function buildNarrative(growthLevel, engLevel, rankDir, rankDelta, isNew, platformCount, industry) {
  // ── 現状の説明 ──
  let situation;
  if (isNew) {
    situation = 'チャートに新規参入したばかりのアーティストです。知名度がゼロから立ち上がるフェーズは最も短期間で認知を獲得できる局面であり、コストも最小です。';
  } else if (growthLevel === 'hot' && rankDir === 'up') {
    situation = `過去30日間で視聴数が急増し、チャートランキングも${rankDelta}ポジション上昇しています。認知がまだ広がり切っていないこの段階は、ブランドが"一緒に浮上できる"最後の窓です。`;
  } else if (growthLevel === 'hot') {
    situation = '視聴数が急速に伸びており、カンボジアの若年層を中心に認知が爆発的に拡大しています。チャート順位の安定と相まって、短期ではなく持続的な注目が続く可能性が高い状態です。';
  } else if (growthLevel === 'rising' && rankDir === 'up') {
    situation = `視聴数・チャート順位がともに上昇トレンドにあります。ランクは30日前より${rankDelta}ポジション改善しており、ファン層が着実に広がっているフェーズです。`;
  } else if (growthLevel === 'rising') {
    situation = '視聴数が継続的に増加しており、固定ファンを超えた新規リスナーへの浸透が始まっています。認知拡大のモメンタムが維持されている安定した成長期です。';
  } else if (rankDir === 'up' && rankDelta && rankDelta >= 5) {
    situation = `視聴数の伸びは緩やかですが、チャートランキングが${rankDelta}ポジション急上昇しています。競合アーティストの脱落とリスナーの再配分が起きており、相対的な存在感が急浮上しています。`;
  } else {
    situation = 'チャート上位に安定してランクインしており、一定の固定ファン層が形成されています。認知の爆発力よりも信頼感・継続性を重視したパートナーシップに適したアーティストです。';
  }

  // ── ブランドへの旨味 ──
  let brandValue;
  if (engLevel === 'ultra' && platformCount >= 2) {
    brandValue = 'エンゲージメント率が業界平均を大幅に上回っており、ファンが実際に行動する層であることを示しています。またSpotify・Apple Musicにも展開済みのため、SNS・ストリーミング・動画の3チャネル同時展開が可能です。';
  } else if (engLevel === 'ultra') {
    brandValue = 'コメント・いいね数の比率がカンボジア音楽市場の平均をはるかに超えています。これはファンがパッシブな視聴者ではなく、能動的に反応・拡散する層であることを意味します。キャンペーン投稿の有機的な広がりが期待できます。';
  } else if (engLevel === 'high' && platformCount >= 2) {
    brandValue = 'エンゲージメント率が高く、複数プラットフォームで存在感があります。YouTube・音楽ストリーミングを通じてリーチできる層が広く、ブランド露出の効率が高い状態です。';
  } else if (engLevel === 'high') {
    brandValue = 'ファンの反応率が高く、ブランドとのタイアップに対してもポジティブな反応が得られやすいオーディエンス構成です。';
  } else if (platformCount >= 2) {
    brandValue = 'YouTube・Spotify・Apple Musicの全プラットフォームに楽曲が展開されており、デジタル音楽消費のすべてのタッチポイントでブランドとの接触機会を作れます。';
  } else {
    brandValue = 'YouTube中心に視聴者を持ち、カンボジア国内での動画広告・ブランド連動コンテンツとの相性が高いアーティストです。';
  }

  // ── タイミングの根拠 ──
  let timingReason;
  if (isNew) {
    timingReason = '新規エントリー直後は、ファンとアーティストの関係が最も新鮮な時期です。ブランドが今ここで接触することで「このアーティストを最初から支えていたブランド」というポジショニングを獲得できます。';
  } else if (growthLevel === 'hot' || (rankDelta !== null && rankDelta >= 8)) {
    timingReason = '現在のモメンタムはいつ鈍化してもおかしくない急加速フェーズです。ピーク前に入ることで、認知拡大の波に乗りながら最も低いコストで最大のリーチを得られます。ピーク後の契約は単価が跳ね上がります。';
  } else if (growthLevel === 'rising') {
    timingReason = '成長が確認されているが、まだ市場に広く知られていない段階です。認知が広まるほど競合ブランドが参入してきます。今が"独占的に接触できる最後のタイミング"である可能性が高いです。';
  } else {
    timingReason = '安定したランキングと継続的な視聴は、長期キャンペーンの土台として機能します。一時的なバズではなく、持続的なブランド露出を狙う場合に適した契約時期です。';
  }

  return { situation, brandValue, timingReason };
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
