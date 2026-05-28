/**
 * insights-fetcher.mjs
 *
 * YouTubeコメント＋動画説明文をClaude で分析し、
 * アーティストの印象・ウィークポイントをシグナルとして返す。
 * 結果は BQ にキャッシュ（7日間）。生テキストは外部に渡さない。
 */
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';

const DS         = 'heat_ranking';
const CACHE_DAYS = 7;
const yt         = google.youtube('v3');

// ── BQ テーブル初期化（初回のみ） ───────────────────────────────
async function ensureTable(bq) {
  await bq.query(`
    CREATE TABLE IF NOT EXISTS \`${DS}.artist_insights\` (
      artist          STRING,
      video_id        STRING,
      impressions     STRING,
      brand_personality STRING,
      target_affinity STRING,
      weaknesses      STRING,
      content_risk    STRING,
      analyzed_at     TIMESTAMP
    )
  `).catch(() => {});
}

// ── BQ キャッシュ確認 ────────────────────────────────────────────
async function getCached(bq, videoId) {
  const [rows] = await bq.query({
    query: `
      SELECT impressions, brand_personality, target_affinity, weaknesses, content_risk
      FROM \`${DS}.artist_insights\`
      WHERE video_id = @vid
        AND analyzed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${CACHE_DAYS} DAY)
      ORDER BY analyzed_at DESC LIMIT 1
    `,
    params: { vid: videoId },
  });
  if (!rows.length) return null;
  const r = rows[0];
  return {
    impressions:      JSON.parse(r.impressions      || '[]'),
    brandPersonality: r.brand_personality            || '',
    targetAffinity:   JSON.parse(r.target_affinity  || '[]'),
    weaknesses:       JSON.parse(r.weaknesses        || '[]'),
    contentRisk:      r.content_risk                 || 'low',
  };
}

// ── YouTube コメント取得（上位50件） ─────────────────────────────
async function fetchComments(videoId, apiKey) {
  try {
    const res = await yt.commentThreads.list({
      key: apiKey,
      part: ['snippet'],
      videoId,
      maxResults: 50,
      order: 'relevance',
      textFormat: 'plainText',
    });
    return (res.data.items || [])
      .map(item => item.snippet.topLevelComment.snippet.textDisplay)
      .filter(Boolean);
  } catch { return []; }
}

// ── 動画説明文取得（歌詞が含まれることがある） ──────────────────
async function fetchDescription(videoId, apiKey) {
  try {
    const res = await yt.videos.list({
      key: apiKey,
      part: ['snippet'],
      id: [videoId],
    });
    return res.data.items?.[0]?.snippet?.description || '';
  } catch { return ''; }
}

// ── Claude 分析 ──────────────────────────────────────────────────
async function analyzeWithClaude(artistName, comments, description) {
  const client = new Anthropic();

  const commentBlock = comments.slice(0, 40).join('\n') || '（コメントなし）';
  const descBlock    = description.slice(0, 1000)       || '（説明文なし）';

  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `カンボジア音楽アーティスト「${artistName}」のYouTubeデータを分析し、ブランドパートナーシップ観点での評価を行ってください。

【視聴者コメント（抜粋）】
${commentBlock}

【動画説明文（抜粋・歌詞含む場合あり）】
${descBlock}

以下のJSON形式のみで出力（余分な説明不要）:
{
  "impressions": ["印象キーワード（例: ロマンティック）", "キーワード2", "キーワード3"],
  "brand_personality": "このアーティストが持つ世界観・雰囲気・視聴者に与える感情の説明（2〜3文）",
  "target_affinity": ["相性の良いブランドカテゴリ（例: 飲料）", "カテゴリ2", "カテゴリ3"],
  "weaknesses": ["ブランド連携上のリスク・懸念点（例: 恋愛テーマに偏りすぎており家族向けには不向き）", "懸念点2"],
  "content_risk": "low または medium または high"
}`,
    }],
  });

  const raw  = msg.content[0].text.trim();
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);

  return {
    impressions:      Array.isArray(json.impressions)     ? json.impressions     : [],
    brandPersonality: typeof json.brand_personality === 'string' ? json.brand_personality : '',
    targetAffinity:   Array.isArray(json.target_affinity) ? json.target_affinity : [],
    weaknesses:       Array.isArray(json.weaknesses)      ? json.weaknesses      : [],
    contentRisk:      ['low','medium','high'].includes(json.content_risk) ? json.content_risk : 'low',
  };
}

// ── BQ キャッシュ保存 ────────────────────────────────────────────
async function cacheInsights(bq, videoId, artistName, ins) {
  await bq.query({
    query: `
      INSERT INTO \`${DS}.artist_insights\`
        (artist, video_id, impressions, brand_personality, target_affinity, weaknesses, content_risk, analyzed_at)
      VALUES (@artist, @vid, @imp, @bp, @ta, @wk, @risk, CURRENT_TIMESTAMP())
    `,
    params: {
      artist: artistName,
      vid:    videoId,
      imp:    JSON.stringify(ins.impressions),
      bp:     ins.brandPersonality,
      ta:     JSON.stringify(ins.targetAffinity),
      wk:     JSON.stringify(ins.weaknesses),
      risk:   ins.contentRisk,
    },
  });
}

// ── 公開API ──────────────────────────────────────────────────────
export async function fetchArtistInsights(bq, videoId, artistName) {
  const ytApiKey = process.env.YOUTUBE_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ⚠ ANTHROPIC_API_KEY 未設定 — insights スキップ');
    return null;
  }

  await ensureTable(bq);

  const cached = await getCached(bq, videoId);
  if (cached) {
    console.log(`    insights: キャッシュ使用 (${videoId})`);
    return cached;
  }

  console.log(`    insights: Claude 分析中 (${videoId})`);
  const [comments, description] = await Promise.all([
    fetchComments(videoId, ytApiKey),
    fetchDescription(videoId, ytApiKey),
  ]);

  const insights = await analyzeWithClaude(artistName, comments, description);
  await cacheInsights(bq, videoId, artistName, insights);
  return insights;
}
