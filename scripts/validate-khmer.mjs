/**
 * Layer 1/2/3 共通: カンボジア楽曲バリデーション
 *
 * 非クメール言語スクリプトの検出と BLOCKLIST チェックを行う。
 * GAS(Layer1)・ランキング生成(Layer2)・FB投稿(Layer3) の3箇所で使用。
 */

// タイ: U+0E00–U+0E7F、ラオス: U+0E80–U+0EFF、ミャンマー: U+1000–U+109F
const FOREIGN_SCRIPT_RE = /[฀-๿຀-ໟက-႟]/g;

/**
 * @param {string} artist
 * @param {string} title
 * @param {string} videoId
 * @param {Set<string>} blocklist  - BLOCKLIST シートから読み込んだ videoId セット
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateKhmerSong(artist, title, videoId, blocklist = new Set()) {
  if (blocklist.has(videoId)) {
    return { valid: false, reason: `BLOCKLIST videoId: ${videoId}` };
  }

  const combined = `${title || ''} ${artist || ''}`;
  const foreignCount = (combined.match(FOREIGN_SCRIPT_RE) || []).length;
  if (foreignCount > 2) {
    return { valid: false, reason: `Foreign script detected (${foreignCount} chars) in: "${combined.slice(0, 60)}"` };
  }

  return { valid: true, reason: '' };
}

/**
 * Google Sheets から BLOCKLIST の videoId セットを取得する
 * @param {object} sheets  - googleapis sheets インスタンス
 * @param {string} sheetId - スプレッドシート ID
 * @returns {Promise<Set<string>>}
 */
export async function loadBlocklist(sheets, sheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'BLOCKLIST!A2:A',
    });
    const ids = (res.data.values || []).map(r => (r[0] || '').trim()).filter(Boolean);
    return new Set(ids);
  } catch {
    console.warn('BLOCKLIST sheet not found, skipping blocklist check.');
    return new Set();
  }
}
