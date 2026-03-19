/**
 * Maintenance.js
 * Merged from RepairRank.js and InspectState.js
 */

/**
 * 壊れた PrevRank を SNAPSHOT データから再計算して修復する
 */
function repairBrokenPrevRanks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRank = ss.getSheetByName('RANKING_DAILY');
  const shSnap = ss.getSheetByName('SNAPSHOT');
  if (!shRank || !shSnap) return;

  const tz = Session.getScriptTimeZone();
  const snapData = shSnap.getDataRange().getValues();
  if (snapData.length < 2) return;

  const dateSet = new Set();
  for (let i = 1; i < snapData.length; i++) {
    const dk = Utilities.formatDate(new Date(snapData[i][0]), tz, 'yyyy-MM-dd');
    dateSet.add(dk);
  }
  const dates = Array.from(dateSet).sort();
  if (dates.length < 2) return;

  const yesterdayDate = dates[dates.length - 2];
  const yesterdaySnapshot = new Map();
  for (let i = 1; i < snapData.length; i++) {
    if (Utilities.formatDate(new Date(snapData[i][0]), tz, 'yyyy-MM-dd') === yesterdayDate) {
      yesterdaySnapshot.set(snapData[i][1], snapData[i][2]);
    }
  }
  const yesterdayList = [];
  yesterdaySnapshot.forEach((views, id) => { yesterdayList.push({ id, views }); });
  yesterdayList.sort((a, b) => b.views - a.views);
  
  const yesterdayRankMap = new Map();
  yesterdayList.forEach((item, index) => { yesterdayRankMap.set(item.id, index + 1); });

  const rankData = shRank.getDataRange().getValues();
  const headers = rankData[0].map(h => String(h || '').trim());
  const vIdIdx = headers.indexOf('videoId');
  const prevRankIdx = headers.indexOf('PrevRank');

  const newPrevRanks = [];
  for (let i = 1; i < rankData.length; i++) {
    const vid = String(rankData[i][vIdIdx]).trim();
    const newPrevRank = yesterdayRankMap.get(vid) || 100;
    newPrevRanks.push([newPrevRank]);
  }

  if (newPrevRanks.length > 0) {
    shRank.getRange(2, prevRankIdx + 1, newPrevRanks.length, 1).setValues(newPrevRanks);
    SpreadsheetApp.getUi().alert('修復完了: PrevRank を再計算しました。');
  }
}

/**
 * システムの現在の状態（シートの行数等）をデバッグ出力する
 */
function inspectState() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const getCount = (name) => {
    const sh = ss.getSheetByName(name);
    return sh ? sh.getLastRow() : -1;
  };
  
  const result = {
    artists: getCount('ARTISTS'),
    songs: getCount('SONGS'),
    snapshots: getCount('SNAPSHOT'),
    rankings: getCount('RANKING_DAILY')
  };
  Logger.log("INSPECT_STATE_OUTPUT: " + JSON.stringify(result));
}
