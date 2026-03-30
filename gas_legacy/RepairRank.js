/**
 * 二重実行で上書きされてしまった PrevRank（前回の順位）を修復するスクリプト
 * 
 * 手順:
 * 1. GASエディタにこのコードを貼り付ける
 * 2. `repairBrokenPrevRanks` 関数を選択して実行する
 * 3. RANKING_DAILY シートの PrevRank 列が更新されたことを確認する
 * 4. 修復後、Webサイトをリロードして変動（▲▼）が表示されるか確認する
 */
function repairBrokenPrevRanks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRank = ss.getSheetByName('RANKING_DAILY');
  const shSnap = ss.getSheetByName('SNAPSHOT');
  if (!shRank || !shSnap) {
    Logger.log('必要なシートが見つかりません。');
    return;
  }

  const tz = Session.getScriptTimeZone();
  const snapData = shSnap.getDataRange().getValues();
  if (snapData.length < 2) return;

  // 1. SNAPSHOT から日付を抽出
  const dateSet = new Set();
  for (let i = 1; i < snapData.length; i++) {
    const dk = Utilities.formatDate(new Date(snapData[i][0]), tz, 'yyyy-MM-dd');
    dateSet.add(dk);
  }
  const dates = Array.from(dateSet).sort();
  if (dates.length < 2) {
    Logger.log('過去のデータが不足しています。');
    return;
  }

  // 今日と昨日の日付を特定
  const latestDate = dates[dates.length - 1];
  const yesterdayDate = dates[dates.length - 2];
  Logger.log(`修復対象: ${latestDate} (前回の参照日: ${yesterdayDate})`);

  // 2. 昨日の全ビデオの再生数を取得
  const yesterdaySnapshot = new Map();
  for (let i = 1; i < snapData.length; i++) {
    if (Utilities.formatDate(new Date(snapData[i][0]), tz, 'yyyy-MM-dd') === yesterdayDate) {
      yesterdaySnapshot.set(snapData[i][1], snapData[i][2]); // videoId -> views
    }
  }

  // 3. 昨日のスコア（簡易版: viewsベース）を計算して順位付け
  // ※本来のHeatスコアを正確に再現するのは難しいため、単純に再生数順で擬似的な順位を作成します
  const yesterdayList = [];
  yesterdaySnapshot.forEach((views, id) => {
    yesterdayList.push({ id, views });
  });
  yesterdayList.sort((a, b) => b.views - a.views);
  
  const yesterdayRankMap = new Map();
  yesterdayList.forEach((item, index) => {
    yesterdayRankMap.set(item.id, index + 1);
  });

  // 4. RANKING_DAILY を更新
  const rankData = shRank.getDataRange().getValues();
  const headers = rankData[0].map(h => String(h || '').trim());
  const vIdIdx = headers.indexOf('videoId');
  const prevRankIdx = headers.indexOf('PrevRank');

  if (vIdIdx === -1 || prevRankIdx === -1) {
    Logger.log('列の特定に失敗しました。');
    return;
  }

  const newPrevRanks = [];
  for (let i = 1; i < rankData.length; i++) {
    const vid = String(rankData[i][vIdIdx]).trim();
    const oldPrevRank = rankData[i][prevRankIdx];
    const newPrevRank = yesterdayRankMap.get(vid) || 100; // 昨日の順位（なければ100位とする）
    newPrevRanks.push([newPrevRank]);
    Logger.log(`Repairing ${vid}: ${oldPrevRank} -> ${newPrevRank}`);
  }

  if (newPrevRanks.length > 0) {
    shRank.getRange(2, prevRankIdx + 1, newPrevRanks.length, 1).setValues(newPrevRanks);
    SpreadsheetApp.getUi().alert('修復完了: 昨日の再生数に基づき PrevRank を再計算しました。');
  }
}
