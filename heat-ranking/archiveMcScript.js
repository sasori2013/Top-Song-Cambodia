function archiveMcScript() {
  const PROJECT_PREFIX = 'TopKhmerBeats';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("MC_SCRIPT");
  if (!sh) throw new Error("MC_SCRIPT sheet not found");

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  const archiveTitle = `${PROJECT_PREFIX}_Archive_${ym}`;

  // アーカイブファイル取得 or 作成
  const files = DriveApp.getFilesByName(archiveTitle);
  const archiveSS = files.hasNext()
    ? SpreadsheetApp.open(files.next())
    : SpreadsheetApp.create(archiveTitle);

  // 同名あれば番号追加
  let sheetName = `${ymd}_MC`;
  let i = 2;
  while (archiveSS.getSheetByName(sheetName)) {
    sheetName = `${ymd}_MC_${i++}`;
  }

  const dst = archiveSS.insertSheet(sheetName);
  const data = sh.getDataRange().getValues();

  dst.getRange(1,1,data.length,data[0].length).setValues(data);

  Logger.log("MC script archived.");
}