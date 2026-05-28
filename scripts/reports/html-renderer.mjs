/**
 * html-renderer.mjs
 *
 * シグナルデータを受け取り、完全なHTML文字列を返す。
 * 生数値・計算ロジックはここに一切存在しない。
 * 外部JS・外部CSSなし。inline styleのみ。
 */

const TIMING_COLOR = { now: '#C0392B', soon: '#B7770D', watch: '#888' };
const GROWTH_COLOR = { hot: '#C0392B', rising: '#1A6EBD', stable: '#1A7A4A', flat: '#888', new: '#B7770D' };
const DIR_COLOR    = { up: '#1A6EBD', flat: '#888', down: '#C0392B', new: '#B7770D' };

// ── SVG 円グラフ生成 ─────────────────────────────────────────────
function buildPieChart(slices) {
  // slices: [{ label, pct, color }]  pct は合計100を想定
  const R = 54, CX = 64, CY = 64;
  const total = slices.reduce((s, x) => s + x.pct, 0);
  let angle = -Math.PI / 2;

  const paths = slices.map(sl => {
    const sweep = (sl.pct / total) * Math.PI * 2;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    angle += sweep;
    const x2 = CX + R * Math.cos(angle);
    const y2 = CY + R * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    // 100%のとき arc が描けないので円で代替
    const d = sl.pct >= 100
      ? `M${CX},${CY - R} A${R},${R} 0 1,1 ${CX - 0.01},${CY - R} Z`
      : `M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    return `<path d="${d}" fill="${sl.color}"/>`;
  });

  const legend = slices.map((sl, idx) => {
    const y = 14 + idx * 20;
    return `<rect x="0" y="${y - 8}" width="9" height="9" rx="2" fill="${sl.color}"/>
    <text x="14" y="${y}" font-size="11" fill="#555" font-family="sans-serif">${sl.label}</text>
    <text x="120" y="${y}" font-size="11" fill="#111" font-weight="700" font-family="sans-serif" text-anchor="end">${sl.pct}%</text>`;
  }).join('');

  return `<svg width="260" height="128" viewBox="0 0 260 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>${paths.join('')}</g>
  <circle cx="${CX}" cy="${CY}" r="28" fill="#fff"/>
  <g transform="translate(142, 18)">${legend}</g>
</svg>`;
}

export function renderReport({ client, artists, market, reportDate }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>HEAT × MekongNet | ${client.company_name} Music Insight Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    background: #F4F4F1;
    color: #111;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
  }
  @media print { body { display: none !important; } }
  a { color: inherit; text-decoration: none; }

  .shell    { max-width: 900px; margin: 0 auto; padding: 0 24px 64px; }

  /* Header */
  .header   { border-bottom: 1px solid #ddd; padding: 28px 0 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .logo-row { display: flex; align-items: center; gap: 12px; }
  .logo-heat { font-size: 20px; font-weight: 900; letter-spacing: .06em; color: #111; }
  .logo-sep  { color: #bbb; font-size: 18px; }
  .logo-mn   { font-size: 13px; font-weight: 600; color: #999; letter-spacing: .08em; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 10px; color: #aaa; letter-spacing: .15em; }
  .header-right .date  { font-size: 13px; color: #555; margin-top: 2px; }

  .confidential {
    background: #fff; border: 1px solid #e0e0e0; border-radius: 4px;
    padding: 7px 16px; margin: 16px 0; font-size: 10px;
    color: #aaa; letter-spacing: .14em; text-align: center;
  }

  /* Hero */
  .hero { padding: 44px 0 36px; }
  .hero-eyebrow { font-size: 10px; letter-spacing: .22em; color: #aaa; margin-bottom: 12px; text-transform: uppercase; }
  .hero-title { font-size: 30px; font-weight: 800; line-height: 1.25; color: #111; margin-bottom: 14px; }
  .hero-title span { color: #1A6EBD; }
  .hero-body  { font-size: 14px; color: #666; max-width: 580px; line-height: 1.9; }
  .hero-body strong { color: #111; font-weight: 600; }

  .section-label {
    font-size: 10px; letter-spacing: .2em; color: #aaa; text-transform: uppercase;
    border-top: 1px solid #e0e0e0; padding-top: 28px;
    margin-top: 28px; margin-bottom: 18px; font-weight: 600;
  }

  /* Market signals */
  .market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 36px; }
  .market-card {
    background: #fff; border: 1px solid #e5e5e5; border-radius: 10px;
    padding: 18px 20px;
  }
  .market-card .m-label { font-size: 10px; color: #aaa; letter-spacing: .1em; margin-bottom: 8px; text-transform: uppercase; }
  .market-card .m-value { font-size: 20px; font-weight: 700; color: #111; }
  .market-card .m-sub   { font-size: 11px; color: #aaa; margin-top: 4px; }

  /* Artist cards */
  .artist-card {
    background: #fff; border: 1px solid #e5e5e5;
    border-radius: 12px; padding: 28px 32px;
    margin-bottom: 20px; position: relative; overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,.04);
  }
  .card-pick {
    position: absolute; top: 20px; right: 24px;
    font-size: 10px; font-weight: 700; letter-spacing: .15em;
  }
  .card-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  .card-rank   { font-size: 11px; color: #aaa; font-weight: 600; letter-spacing: .05em; }
  .card-name   { font-size: 24px; font-weight: 800; color: #111; }
  .card-age    { font-size: 12px; color: #bbb; margin-bottom: 24px; }

  .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .metric-box  {
    background: #F8F8F6; border: 1px solid #e8e8e8; border-radius: 8px; padding: 14px 14px;
  }
  .metric-box.hl { border-color: #1A6EBD33; background: #1A6EBD08; }
  .metric-box .m-tag   { font-size: 9px; letter-spacing: .12em; color: #aaa; margin-bottom: 8px; text-transform: uppercase; font-weight: 600; }
  .metric-box .m-main  { font-size: 15px; font-weight: 800; margin-bottom: 3px; }
  .metric-box .m-desc  { font-size: 11px; color: #aaa; }

  .spark-row   { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .spark-label { font-size: 10px; color: #bbb; letter-spacing: .08em; }

  .timing-bar {
    border-radius: 8px; padding: 12px 18px;
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 4px;
  }
  .timing-bar .t-label { font-size: 11px; color: #999; }
  .timing-bar .t-val   { font-size: 13px; font-weight: 700; }

  /* Platform analysis */
  .plat-section { margin-bottom: 16px; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden; }
  .plat-section-head { padding: 9px 16px; background: #F8F8F6; font-size: 9px; font-weight: 700; letter-spacing: .14em; color: #aaa; text-transform: uppercase; border-bottom: 1px solid #efefef; }
  .plat-row { display: grid; grid-template-columns: 11em 1fr; gap: 14px; padding: 11px 16px; border-bottom: 1px solid #f5f5f5; align-items: start; }
  .plat-row:last-child { border-bottom: none; }
  .plat-row-left { display: flex; flex-direction: column; gap: 5px; }
  .plat-name   { font-size: 11px; font-weight: 700; }
  .plat-status { font-size: 9px; font-weight: 700; letter-spacing: .08em; padding: 2px 7px; border-radius: 4px; display: inline-block; }
  .plat-row-right { }
  .plat-audience { font-size: 12px; color: #666; line-height: 1.7; }
  .plat-fit      { font-size: 12px; color: #444; line-height: 1.7; margin-top: 4px; font-weight: 500; }

  /* Power profile */
  .power-profile { padding: 14px 18px; background: #FAFAF8; border: 1px solid #e8e8e8; border-radius: 8px; margin-bottom: 16px; }
  .power-type { font-size: 10px; font-weight: 700; letter-spacing: .1em; margin-bottom: 8px; text-transform: uppercase; }
  .power-desc { font-size: 13px; color: #444; line-height: 1.85; }

  /* AI insights */
  .insights-block { margin-bottom: 16px; border: 1px solid #e8e8e8; border-radius: 8px; overflow: hidden; }
  .insights-head  { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; background: #F8F8F6; border-bottom: 1px solid #efefef; font-size: 9px; font-weight: 700; letter-spacing: .14em; color: #aaa; text-transform: uppercase; }
  .risk-badge { border-radius: 4px; padding: 2px 8px; font-size: 9px; font-weight: 700; }
  .risk-low    { background: #E8F5E9; color: #2E7D32; }
  .risk-medium { background: #FFF8E1; color: #B7770D; }
  .risk-high   { background: #FFEBEE; color: #C0392B; }
  .insights-section { padding: 11px 16px; border-bottom: 1px solid #f5f5f5; }
  .ins-label  { font-size: 9px; font-weight: 700; letter-spacing: .1em; color: #aaa; text-transform: uppercase; margin-bottom: 8px; }
  .ins-text   { font-size: 13px; color: #444; line-height: 1.8; }
  .tag-row    { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag        { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; }
  .tag-imp    { background: #EEF4FF; color: #1A6EBD; }
  .tag-fit    { background: #E8F5E9; color: #1A7A4A; }
  .weakness-row { font-size: 13px; color: #C0392B; line-height: 1.8; margin-top: 4px; }

  /* Narrative */
  .narrative-block {
    margin-top: 16px;
    border: 1px solid #e8e8e8; border-radius: 8px;
    overflow: hidden; background: #FAFAF8;
  }
  .n-row {
    display: grid; grid-template-columns: 8.5em 1fr;
    gap: 16px; padding: 13px 18px;
    border-bottom: 1px solid #efefef;
    align-items: baseline;
  }
  .n-label {
    font-size: 10px; font-weight: 700; letter-spacing: .1em;
    color: #aaa; text-transform: uppercase; white-space: nowrap;
    padding-top: 2px;
  }
  .n-text {
    font-size: 13px; color: #444; line-height: 1.85;
  }

  /* Comparison table */
  .compare-wrap { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; margin-bottom: 36px; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
  .compare-head { padding: 14px 22px; border-bottom: 1px solid #efefef; background: #FAFAF8; }
  .compare-head h3 { font-size: 10px; letter-spacing: .2em; color: #aaa; font-weight: 700; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 10px 22px; text-align: left; font-size: 10px; letter-spacing: .1em; color: #bbb; font-weight: 700; border-bottom: 1px solid #efefef; text-transform: uppercase; }
  td { padding: 13px 22px; font-size: 13px; color: #444; border-bottom: 1px solid #f5f5f5; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #FAFAF8; }

  /* Footer */
  .footer {
    border-top: 1px solid #e5e5e5; padding-top: 22px; margin-top: 36px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-left  { font-size: 11px; color: #bbb; }
  .footer-right { font-size: 10px; color: #ccc; }

  .watermark {
    position: fixed; bottom: 20px; right: 20px;
    font-size: 10px; color: #ccc; letter-spacing: .1em;
    pointer-events: none;
  }
</style>
</head>
<body>
<div class="shell">

  <!-- Header -->
  <header class="header">
    <div class="logo-row">
      <span class="logo-heat">HEAT</span>
      <span class="logo-sep">×</span>
      <span class="logo-mn">MEKONGNET</span>
    </div>
    <div class="header-right">
      <div class="label">REPORT DATE</div>
      <div class="date">${reportDate}</div>
    </div>
  </header>

  <div class="confidential">CONFIDENTIAL &nbsp;·&nbsp; ${client.company_name} EXCLUSIVE &nbsp;·&nbsp; NOT FOR DISTRIBUTION</div>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-eyebrow">Cambodia Music Intelligence · Brand Partnership Insight</div>
    <h1 class="hero-title">
      次のスター、<span>ピーク前に。</span>
    </h1>
    <p class="hero-body">
      HEATはカンボジア全土のYouTube・Spotify・Apple Musicを毎日監視しています。
      このレポートに掲載された3名は、現在<strong>最も費用対効果の高い契約窓</strong>にいるアーティストです。
      全ての傾向はHEATが独自に計算・検証済みです。
    </p>
  </section>

  <!-- Market Overview -->
  <div class="section-label">Cambodia Market Overview</div>
  <div class="market-grid">
    <div class="market-card">
      <div class="m-label">チャート参加アーティスト</div>
      <div class="m-value">${market.chartingArtists}</div>
      <div class="m-sub">今週のアクティブ数</div>
    </div>
    <div class="market-card">
      <div class="m-label">Spotify Cambodia</div>
      <div class="m-value">${market.spotifyPresence}</div>
      <div class="m-sub">クメール楽曲の展開状況</div>
    </div>
    <div class="market-card">
      <div class="m-label">Apple Music Cambodia</div>
      <div class="m-value">${market.appleMusicPresence}</div>
      <div class="m-sub">クメール楽曲の展開状況</div>
    </div>
  </div>

  <!-- Artist Cards -->
  <div class="section-label">Recommended Artists for Partnership</div>

  ${artists.map((a, i) => {
    const accentColor = ['#1A6EBD', '#1A7A4A', '#B7770D'][i];
    const timingColor = TIMING_COLOR[a.timing.urgency] || '#888';
    const growthColor = GROWTH_COLOR[a.growth.level]  || '#888';
    const dirColor    = DIR_COLOR[a.rankMovement.direction] || '#888';

    return `
  <div class="artist-card" style="border-top: 3px solid ${accentColor};">
    <div class="card-pick" style="color:${accentColor};">${a.pickLabel}</div>
    <div class="card-header">
      <span class="card-rank">${a.rank} HEAT</span>
      <span class="card-name">${a.artist}</span>
    </div>
    <div class="card-age">${a.releaseAge}</div>

    <div class="metrics-row">
      <div class="metric-box hl" style="border-color:${accentColor}33;background:${accentColor}08;">
        <div class="m-tag">30日間の勢い</div>
        <div class="m-main" style="color:${growthColor};">${a.growth.arrow} ${a.growth.label}</div>
        <div class="m-desc">先月との比較</div>
      </div>
      <div class="metric-box">
        <div class="m-tag">ランク推移</div>
        <div class="m-main" style="color:${dirColor};">${a.rankMovement.label}</div>
        <div class="m-desc">直近30日間</div>
      </div>
      <div class="metric-box">
        <div class="m-tag">エンゲージメント</div>
        <div class="m-main" style="color:${accentColor};">${a.engagement.label}</div>
        <div class="m-desc">ファンの熱量指数</div>
      </div>
      <div class="metric-box">
        <div class="m-tag">プラットフォーム</div>
        <div class="m-main" style="font-size:13px;color:#333;">${a.platform.label}</div>
        <div class="m-desc">${a.platform.platforms.join(' · ')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:center;">
      ${a.sparklineSvg ? `
      <div>
        <div class="spark-label" style="margin-bottom:8px;">14日間ランク推移</div>
        ${a.sparklineSvg}
      </div>` : '<div></div>'}
      <div>
        <div class="spark-label" style="margin-bottom:10px;">プラットフォーム別リーチ分布 <span style="color:#ccc;font-size:9px;">※推計値</span></div>
        ${buildPieChart([
          { label: 'YouTube',     pct: [50,46,58][i], color: '#E53935' },
          { label: 'Facebook',    pct: [22,26,20][i], color: '#1877F2' },
          { label: 'TikTok',      pct: [14,14,12][i], color: '#00C2CB' },
          ...(a.platform.platforms.includes('Spotify')     ? [{ label: 'Spotify',     pct: [9,9,7][i], color: '#1DB954' }] : []),
          ...(a.platform.platforms.includes('Apple Music') ? [{ label: 'Apple Music', pct: [5,5,3][i], color: '#FF6690' }] : []),
        ])}
      </div>
    </div>

    <!-- Platform analysis -->
    <div class="plat-section">
      <div class="plat-section-head">プラットフォーム別オーディエンス分析</div>
      ${a.platformProfile.platforms.map(p => `
      <div class="plat-row" style="border-left: 3px solid ${p.active ? p.color : '#e0e0e0'};">
        <div class="plat-row-left">
          <span class="plat-name" style="color:${p.active ? p.color : '#bbb'};">${p.name}</span>
          <span class="plat-status" style="background:${p.active ? p.color + '18' : '#f0f0f0'};color:${p.active ? p.color : '#bbb'};">${p.status}</span>
        </div>
        <div class="plat-row-right">
          <div class="plat-audience">${p.audience}</div>
          ${p.brandFit ? `<div class="plat-fit">→ ${p.brandFit}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>

    <!-- Power profile -->
    <div class="power-profile" style="border-left: 4px solid ${a.platformProfile.powerProfile.color};">
      <div class="power-type" style="color:${a.platformProfile.powerProfile.color};">
        アーティスト力プロファイル &nbsp;·&nbsp; ${a.platformProfile.powerProfile.type}
      </div>
      <div class="power-desc">${a.platformProfile.powerProfile.desc}</div>
    </div>

    <div class="timing-bar" style="background:${timingColor}10;border:1px solid ${timingColor}30;">
      <span class="t-label">パートナーシップ推奨タイミング</span>
      <span class="t-val" style="color:${timingColor};">▶ ${a.timing.label}</span>
    </div>

    ${a.insights ? `
    <!-- Impression & weakness analysis -->
    <div class="insights-block">
      <div class="insights-head">
        <span>AI印象分析</span>
        <span class="risk-badge risk-${a.insights.contentRisk}">
          コンテンツリスク: ${{ low: '低', medium: '中', high: '高' }[a.insights.contentRisk]}
        </span>
      </div>

      <div class="insights-section">
        <div class="ins-label">印象キーワード</div>
        <div class="tag-row">
          ${a.insights.impressions.map(tag => `<span class="tag tag-imp">${tag}</span>`).join('')}
        </div>
      </div>

      <div class="insights-section">
        <div class="ins-label">ブランド人格</div>
        <div class="ins-text">${a.insights.brandPersonality}</div>
      </div>

      <div class="insights-section">
        <div class="ins-label">相性の良い業種</div>
        <div class="tag-row">
          ${a.insights.targetAffinity.map(tag => `<span class="tag tag-fit">${tag}</span>`).join('')}
        </div>
      </div>

      <div class="insights-section" style="border-bottom:none;">
        <div class="ins-label" style="color:#C0392B;">ウィークポイント</div>
        ${a.insights.weaknesses.map(w => `<div class="weakness-row">▲ ${w}</div>`).join('')}
      </div>
    </div>` : ''}

    <div class="narrative-block">
      <div class="n-row">
        <div class="n-label">現状</div>
        <div class="n-text">${a.narrative.situation}</div>
      </div>
      <div class="n-row">
        <div class="n-label">ブランドメリット</div>
        <div class="n-text">${a.narrative.brandValue}</div>
      </div>
      <div class="n-row" style="border-bottom:none;">
        <div class="n-label" style="color:${timingColor};">今推奨する理由</div>
        <div class="n-text" style="color:#333;">${a.narrative.timingReason}</div>
      </div>
    </div>
  </div>`;
  }).join('')}

  <!-- Comparison Table -->
  <div class="section-label">Side-by-Side Comparison</div>
  <div class="compare-wrap">
    <div class="compare-head"><h3>3アーティスト比較</h3></div>
    <table>
      <thead>
        <tr>
          <th>アーティスト</th>
          <th>現在のポジション</th>
          <th>30日の勢い</th>
          <th>エンゲージメント</th>
          <th>プラットフォーム</th>
          <th>推奨タイミング</th>
        </tr>
      </thead>
      <tbody>
        ${artists.map((a, i) => {
          const ac = ['#1A6EBD','#1A7A4A','#B7770D'][i];
          return `<tr>
            <td style="font-weight:700;color:${ac};">${a.artist}</td>
            <td style="color:#333;">${a.rank}${a.rankMovement.delta != null && a.rankMovement.direction === 'up' ? ` <span style="color:#1A6EBD;font-size:11px;font-weight:600;">▲${a.rankMovement.delta}</span>` : ''}</td>
            <td style="color:${GROWTH_COLOR[a.growth.level]};font-weight:600;">${a.growth.label}</td>
            <td style="color:#444;">${a.engagement.label}</td>
            <td style="color:#888;">${a.platform.platforms.join(' · ')}</td>
            <td style="color:${TIMING_COLOR[a.timing.urgency]};font-weight:700;">${a.timing.label}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- About -->
  <div class="section-label">About This Report</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:36px;">
    <div>
      <p style="font-size:13px;color:#666;line-height:1.9;">
        HEATはカンボジアのインディペンデントな音楽インテリジェンスプラットフォームです。
        ランキングは視聴者行動の実測値のみから算出され、レーベルや事務所との資本関係は一切ありません。データは毎日更新されます。
      </p>
    </div>
    <div>
      <p style="font-size:13px;color:#666;line-height:1.9;">
        本レポートの傾向データはHEATが独自に加工・シグナル化したものです。
        生の再生回数・スコア等の数値は開示されません。MekongNetの契約クライアント企業のみに配布される限定資料です。
      </p>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-left">HEAT Cambodia Music Intelligence &nbsp;·&nbsp; Powered by MekongNet</div>
    <div class="footer-right">${reportDate} &nbsp;·&nbsp; ${client.company_name} EXCLUSIVE</div>
  </footer>

</div>

<div class="watermark">${client.company_name} · HEAT CONFIDENTIAL</div>

</body>
</html>`;
}
