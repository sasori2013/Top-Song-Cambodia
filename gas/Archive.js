/**
 * Archive.js
 * Merged from archiveMcScript.js and archiveWeeklyRanking.js
 */

/**
 * 日次・週次ランキングを外部スプレッドシートへアーカイブする
 */
function archiveRankings() {
  archiveSheetToExternal_('RANKING_DAILY', 'Daily');
  archiveSheetToExternal_('RANKING_WEEKLY', 'Weekly');
}

/**
 * MC脚本を外部スプレッドシートへアーカイブする
 */
function archiveMcScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MC_SCRIPT");
  if (!sh) return;

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  const archiveSS = getOrCreateSpreadsheetByName_(`TopKhmerBeats_Archive_${ym}`);
  let sheetName = `${ymd}_MC`;
  let i = 2;
  while (archiveSS.getSheetByName(sheetName)) sheetName = `${ymd}_MC_${i++}`;

  const data = sh.getDataRange().getValues();
  archiveSS.insertSheet(sheetName).getRange(1, 1, data.length, data[0].length).setValues(data);
  Logger.log("MC script archived.");
}

/**
 * 指定したシートを月別アーカイブファイルへコピーする（内部用）
 */
function archiveSheetToExternal_(sourceSheetName, label) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(sourceSheetName);
  if (!src) return;

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const archiveSS = getOrCreateSpreadsheetByName_(`TopKhmerBeats_Archive_${ym}`);

  let sheetName = `${ymd}_${label}`;
  let n = 2;
  while (archiveSS.getSheetByName(sheetName)) sheetName = `${ymd}_${label}_${n++}`;

  const data = src.getDataRange().getValues();
  if (!data || data.length < 2) return;

  archiveSS.insertSheet(sheetName).getRange(1, 1, data.length, data[0].length).setValues(data);
  Logger.log(`Archived ${sourceSheetName} to ${archiveSS.getName()}`);
}

/**
 * SNAPSHOTシートを外部へアーカイブする
 */
function archiveSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('SNAPSHOT');
  if (!src) return;

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  const archiveSS = getOrCreateSpreadsheetByName_(`TopKhmerBeats_Snapshot_Archive_${ym}`);
  let sheetName = `${ymd}_Snap`;
  let n = 2;
  while (archiveSS.getSheetByName(sheetName)) sheetName = `${ymd}_Snap_${n++}`;

  const lastRow = src.getLastRow();
  const numRows = Math.min(lastRow, 10000); 
  if (numRows < 2) return;

  const data = src.getRange(lastRow - numRows + 1, 1, numRows, 5).getValues();
  const dst = archiveSS.insertSheet(sheetName);
  dst.getRange(1, 1, data.length, 5).setValues(data);
  Logger.log(`Snapshot archived to ${archiveSS.getName()}`);
}

function getOrCreateSpreadsheetByName_(title) {
  const files = DriveApp.getFilesByName(title);
  if (files.hasNext()) return SpreadsheetApp.openById(files.next().getId());
  return SpreadsheetApp.create(title);
}
