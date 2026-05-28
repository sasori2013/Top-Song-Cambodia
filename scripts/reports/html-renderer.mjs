/**
 * html-renderer.mjs
 *
 * シグナルデータを受け取り、完全なHTML文字列を返す。
 * 生数値・計算ロジックはここに一切存在しない。
 * 外部JS・外部CSSなし。inline styleのみ。
 */

const TIMING_COLOR = { now: '#00E5FF', soon: '#FFD600', watch: '#888' };
const GROWTH_COLOR = { hot: '#FF4D4D', rising: '#00E5FF', stable: '#00FFA3', flat: '#888', new: '#FFD600' };
const DIR_COLOR    = { up: '#00E5FF', flat: '#888', down: '#FF6B6B', new: '#FFD600' };

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
    background: #080808;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
    /* 印刷・保存抑止 */
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
  }
  @media print { body { display: none !important; } }
  a { color: inherit; text-decoration: none; }

  .shell    { max-width: 900px; margin: 0 auto; padding: 0 24px 64px; }
  .header   { border-bottom: 1px solid #1a1a1a; padding: 28px 0 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .logo-row { display: flex; align-items: center; gap: 12px; }
  .logo-heat { font-size: 20px; font-weight: 900; letter-spacing: .06em; color: #00E5FF; }
  .logo-sep  { color: #333; font-size: 18px; }
  .logo-mn   { font-size: 14px; font-weight: 600; color: #666; letter-spacing: .08em; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 10px; color: #444; letter-spacing: .15em; }
  .header-right .date  { font-size: 13px; color: #666; margin-top: 2px; }

  .confidential {
    background: #0d0d0d; border: 1px solid #1e1e1e; border-radius: 6px;
    padding: 8px 16px; margin: 20px 0; font-size: 11px;
    color: #444; letter-spacing: .12em; text-align: center;
  }

  .hero { padding: 48px 0 40px; }
  .hero-eyebrow { font-size: 11px; letter-spacing: .2em; color: #444; margin-bottom: 12px; }
  .hero-title { font-size: 32px; font-weight: 800; line-height: 1.25; color: #fff; margin-bottom: 16px; }
  .hero-title span { color: #00E5FF; }
  .hero-body  { font-size: 14px; color: #666; max-width: 560px; line-height: 1.8; }

  .section-label {
    font-size: 10px; letter-spacing: .2em; color: #333;
    border-top: 1px solid #161616; padding-top: 32px;
    margin-top: 32px; margin-bottom: 20px;
  }

  /* Market signals */
  .market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 40px; }
  .market-card {
    background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 10px;
    padding: 18px 20px;
  }
  .market-card .m-label { font-size: 10px; color: #444; letter-spacing: .1em; margin-bottom: 8px; }
  .market-card .m-value { font-size: 18px; font-weight: 700; color: #ccc; }
  .market-card .m-sub   { font-size: 11px; color: #555; margin-top: 4px; }

  /* Artist cards */
  .artist-card {
    background: #0d0d0d; border: 1px solid #1a1a1a;
    border-radius: 14px; padding: 32px 36px;
    margin-bottom: 20px; position: relative; overflow: hidden;
  }
  .artist-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  }
  .card-pick {
    position: absolute; top: 20px; right: 24px;
    font-size: 10px; font-weight: 700; letter-spacing: .15em; opacity: .7;
  }
  .card-header { display: flex; align-items: baseline; gap: 14px; margin-bottom: 6px; }
  .card-rank   { font-size: 12px; color: #444; }
  .card-name   { font-size: 24px; font-weight: 800; color: #fff; }
  .card-age    { font-size: 12px; color: #444; margin-bottom: 28px; }

  .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .metric-box  {
    background: #111; border: 1px solid #1a1a1a; border-radius: 8px; padding: 14px 16px;
  }
  .metric-box.hl { border-color: #00E5FF33; background: #00E5FF08; }
  .metric-box .m-tag   { font-size: 9px; letter-spacing: .12em; color: #444; margin-bottom: 8px; }
  .metric-box .m-main  { font-size: 18px; font-weight: 800; margin-bottom: 3px; }
  .metric-box .m-desc  { font-size: 11px; color: #555; }

  .spark-row   { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  .spark-label { font-size: 10px; color: #444; }

  .platform-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .plat-badge {
    display: flex; align-items: center; gap: 6px;
    background: #111; border: 1px solid #1a1a1a;
    border-radius: 6px; padding: 6px 12px; font-size: 11px; color: #666;
  }
  .plat-dot { width: 6px; height: 6px; border-radius: 50%; }

  .timing-bar {
    border-radius: 8px; padding: 12px 18px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .timing-bar .t-label { font-size: 11px; color: #888; }
  .timing-bar .t-val   { font-size: 13px; font-weight: 700; }

  .narrative-block {
    margin-top: 20px;
    border: 1px solid #1e1e1e; border-radius: 10px;
    overflow: hidden;
  }
  .n-row {
    display: grid; grid-template-columns: 9em 1fr;
    gap: 16px; padding: 14px 20px;
    border-bottom: 1px solid #141414;
    align-items: baseline;
  }
  .n-label {
    font-size: 10px; font-weight: 700; letter-spacing: .12em;
    color: #555; text-transform: uppercase; white-space: nowrap;
    padding-top: 2px;
  }
  .n-text {
    font-size: 13px; color: #888; line-height: 1.85;
  }

  /* Comparison table */
  .compare-wrap { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 12px; overflow: hidden; margin-bottom: 40px; }
  .compare-head { padding: 16px 24px; border-bottom: 1px solid #161616; }
  .compare-head h3 { font-size: 10px; letter-spacing: .2em; color: #444; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 10px 24px; text-align: left; font-size: 10px; letter-spacing: .1em; color: #444; font-weight: 600; border-bottom: 1px solid #161616; }
  td { padding: 14px 24px; font-size: 13px; color: #888; border-bottom: 1px solid #0f0f0f; }
  tr:last-child td { border-bottom: none; }

  .footer {
    border-top: 1px solid #141414; padding-top: 24px; margin-top: 40px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-left  { font-size: 11px; color: #333; }
  .footer-right { font-size: 10px; color: #2a2a2a; }

  .watermark {
    position: fixed; bottom: 20px; right: 20px;
    font-size: 10px; color: #1a1a1a; letter-spacing: .1em;
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
    <div class="hero-eyebrow">CAMBODIA MUSIC INTELLIGENCE · BRAND PARTNERSHIP INSIGHT</div>
    <h1 class="hero-title">
      次のスター、<span>ピーク前に。</span>
    </h1>
    <p class="hero-body">
      HEATはカンボジア全土のYouTube・Spotify・Apple Musicを毎日監視しています。
      このレポートに掲載された3名は、現在<strong style="color:#ccc">最も費用対効果の高い契約窓</strong>にいるアーティストです。
      数値は非公開ですが、全ての傾向はHEATが独自に計算・検証済みです。
    </p>
  </section>

  <!-- Market Overview -->
  <div class="section-label">CAMBODIA MARKET OVERVIEW</div>
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
  <div class="section-label">RECOMMENDED ARTISTS FOR PARTNERSHIP</div>

  ${artists.map((a, i) => {
    const accentColor = ['#00E5FF', '#00FFA3', '#FFD600'][i];
    const timingColor = TIMING_COLOR[a.timing.urgency] || '#888';
    const growthColor = GROWTH_COLOR[a.growth.level]  || '#888';
    const dirColor    = DIR_COLOR[a.rankMovement.direction] || '#888';

    return `
  <div class="artist-card" style="border-color: ${accentColor}18;">
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${accentColor},transparent);"></div>
    <div class="card-pick" style="color:${accentColor};">${a.pickLabel}</div>
    <div class="card-header">
      <span class="card-rank">${a.rank} HEAT</span>
      <span class="card-name">${a.artist}</span>
    </div>
    <div class="card-age">${a.releaseAge}</div>

    <div class="metrics-row">
      <div class="metric-box hl">
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
        <div class="m-tag">展開プラットフォーム</div>
        <div class="m-main" style="font-size:14px;color:#ccc;">${a.platform.label}</div>
        <div class="m-desc">${a.platform.platforms.join(' · ')}</div>
      </div>
    </div>

    ${a.sparklineSvg ? `
    <div class="spark-row">
      <span class="spark-label">14日間ランク推移</span>
      ${a.sparklineSvg}
    </div>` : ''}

    <div class="timing-bar" style="background:${timingColor}12;border:1px solid ${timingColor}22;">
      <span class="t-label">パートナーシップ推奨タイミング</span>
      <span class="t-val" style="color:${timingColor};">▶ ${a.timing.label}</span>
    </div>

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
        <div class="n-text" style="color:#bbb;">${a.narrative.timingReason}</div>
      </div>
    </div>
  </div>`;
  }).join('')}

  <!-- Comparison Table -->
  <div class="section-label">SIDE-BY-SIDE COMPARISON</div>
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
          const c = ['#00E5FF','#00FFA3','FFD600'][i];
          return `<tr>
            <td style="font-weight:700;color:${['#00E5FF','#00FFA3','#FFD600'][i]};">${a.artist}</td>
            <td>${a.rank} ${a.rankMovement.delta != null ? `<span style="color:#00E5FF;font-size:11px;">▲${a.rankMovement.delta}</span>` : ''}</td>
            <td style="color:${GROWTH_COLOR[a.growth.level]};">${a.growth.label}</td>
            <td>${a.engagement.label}</td>
            <td style="color:#555;">${a.platform.platforms.join(' · ')}</td>
            <td style="color:${TIMING_COLOR[a.timing.urgency]};font-weight:600;">${a.timing.label}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Methodology -->
  <div class="section-label">ABOUT THIS REPORT</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:40px;">
    <div>
      <p style="font-size:13px;color:#555;line-height:1.9;">
        HEATはカンボジアのインディペンデントな音楽インテリジェンスプラットフォームです。
        ランキングは視聴者行動の実測値のみから算出され、
        レーベルや事務所との資本関係は一切ありません。データは毎日更新されます。
      </p>
    </div>
    <div>
      <p style="font-size:13px;color:#555;line-height:1.9;">
        本レポートの傾向データはHEATが独自に加工・シグナル化したものです。
        生の再生回数・スコア等の数値は開示されません。
        MekongNetの契約クライアント企業のみに配布される限定資料です。
      </p>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-left">HEAT Cambodia Music Intelligence &nbsp;·&nbsp; Powered by MekongNet</div>
    <div class="footer-right">${reportDate} &nbsp;·&nbsp; ${client.company_name} EXCLUSIVE</div>
  </footer>

</div>

<!-- Watermark -->
<div class="watermark">${client.company_name} · HEAT CONFIDENTIAL</div>

</body>
</html>`;
}
