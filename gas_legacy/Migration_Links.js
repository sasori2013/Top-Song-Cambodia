/**
 * すでに「SONGS」シートにある曲名（C列）を、videoId（A列）を元に
 * 全てハイパーリンク（=HYPERLINK）へ一括で更新するスクリプトです。
 * 
 * 使用方法:
 * 1. Google スプレッドシートの「拡張機能」 > 「Apps Script」を開きます。
 * 2. このコードを新しいファイルとして貼り付けます。
 * 3. 関数 `migrateExistingSongsToLinks` を選択して実行してください。
 */
function migrateExistingSongsToLinks() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('SONGS');
  if (!sh) {
    Logger.log('SONGSシートが見つかりません。');
    return;
  }

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  // A列: videoId, C列: title
  // 1=A, 2=B, 3=C, 4=D
  const range = sh.getRange(2, 1, lastRow - 1, lastCol);
  const data = range.getValues();

  for (let i = 0; i < data.length; i++) {
    const videoId = String(data[i][0]).trim();
    const title = String(data[i][2]).trim();

    // 既に数式の場合はスルー
    if (title.startsWith('=') || title.includes('HYPERLINK')) continue;

    if (videoId && title) {
      const url = "https://www.youtube.com/watch?v=" + videoId;
      const linkedTitle = '=HYPERLINK("' + url + '", "' + title.replace(/"/g, '""') + '")';
      data[i][2] = linkedTitle; // C列を書き換え
    }
  }

  // シートに書き戻し（setValues は数式もそのまま書き込める）
  range.setValues(data);
  Logger.log((lastRow - 1) + ' 件のデータを確認/更新しました。');
}
