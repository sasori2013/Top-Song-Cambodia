/**
 * classificationSource の有効値を一元管理する。
 * 各スクリプトはこのファイルからインポートして使用すること。
 *
 * 値の意味:
 *   AI              - Gemini/AI による自動分類（通常の新曲取込）
 *   AI_REFRESH      - refresh-metadata-node.mjs による再分類
 *   AI_CLEANED      - reapply-roster-bq.mjs によるロースター再適用後
 *   ARTIST_FIXED    - 手動確定済み（この値の曲は artist / detectedArtist を上書き禁止）
 *   ARTIST_RECOVERED - bulk-artist-recovery.mjs による復元
 *   MANUAL_SHEET_SYNC - sync-sheets-to-bq.mjs による手動シート同期
 */
export const SOURCE = Object.freeze({
  AI:               'AI',
  AI_REFRESH:       'AI_REFRESH',
  AI_CLEANED:       'AI_CLEANED',
  ARTIST_FIXED:     'ARTIST_FIXED',
  ARTIST_RECOVERED: 'ARTIST_RECOVERED',
  MANUAL_SHEET_SYNC:'MANUAL_SHEET_SYNC',
});
