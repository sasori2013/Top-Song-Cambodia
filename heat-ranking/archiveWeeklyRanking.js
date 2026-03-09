/**
 * Weekly archive:
 * - Copies current "RANKING" sheet into a monthly archive Spreadsheet.
 * - Each week becomes a new sheet: YYYY-MM-DD_W##
 * - Archive Spreadsheet is created automatically per month: TopKhmerBeats_Archive_YYYY-MM
 *
 * IMPORTANT:
 * 1) Set ARCHIVE_FOLDER_ID (recommended) OR leave it empty to create in My Drive root.
 * 2) Set PROJECT_PREFIX if you want.
 */
/**
 * 日次・週次ランキングをアーカイブする
 */
function archiveRankings() {
  archiveSheetToExternal_('RANKING_DAILY', 'Daily');
  archiveSheetToExternal_('RANKING_WEEKLY', 'Weekly');
}

/**
 * 指定したシートを月別アーカイブファイルへコピーする
 * @param {string} sourceSheetName 元シート名
 * @param {string} label アーカイブ後の接尾辞
 */
function archiveSheetToExternal_(sourceSheetName, label) {
  const PROJECT_PREFIX = 'TopKhmerBeats';

  // ★おすすめ：アーカイブを置くDriveフォルダID（空でも動く）
  const ARCHIVE_FOLDER_ID = ''; // ← フォルダIDを入れる（任意）

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(sourceSheetName);
  if (!src) {
    Logger.log(`${sourceSheetName} sheet not found. Skipping.`);
    return;
  }

  const tz = Session.getScriptTimeZone();
  const now = new Date();

  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const weekNo = getISOWeekNumber_(now);
  const sheetNameBase = `${ymd}_${label}`;

  // 1) 月別アーカイブファイルを取得（なければ作成）
  const archiveTitle = `${PROJECT_PREFIX}_Archive_${ym}`;
  const archiveSS = getOrCreateSpreadsheetByName_(archiveTitle, ARCHIVE_FOLDER_ID);

  // 2) 週次シート名（重複回避）
  let sheetName = sheetNameBase;
  let n = 2;
  while (archiveSS.getSheetByName(sheetName)) {
    sheetName = `${sheetNameBase}_${n++}`;
  }

  // 3) 値として保存（コピーではなく “値貼り” ＝壊れない）
  const data = src.getDataRange().getValues();
  if (!data || data.length < 2) throw new Error('RANKING has no data to archive');

  const dst = archiveSS.insertSheet(sheetName);
  dst.getRange(1, 1, data.length, data[0].length).setValues(data);

  // 4) 見た目：最低限（任意）
  dst.setFrozenRows(1);
  dst.autoResizeColumns(1, Math.min(data[0].length, 20));

  Logger.log(`Archived ${sourceSheetName} -> ${archiveTitle} / ${sheetName}`);
}


/**
 * Get existing Spreadsheet by exact name, else create.
 * If ARCHIVE_FOLDER_ID is set, move created file into that folder.
 */
function getOrCreateSpreadsheetByName_(title, folderId) {
  const files = DriveApp.getFilesByName(title);
  if (files.hasNext()) {
    const f = files.next();
    return SpreadsheetApp.openById(f.getId());
  }

  const ss = SpreadsheetApp.create(title);
  const file = DriveApp.getFileById(ss.getId());

  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    folder.addFile(file);

    // マイドライブ直下から除外（権限によって失敗してもOK）
    try {
      DriveApp.getRootFolder().removeFile(file);
    } catch (e) {}
  }

  // 作成直後のデフォルトシートを整理（残しても害なし）
  try {
    const sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getName() === 'Sheet1') {
      sheets[0].setName('README');
      sheets[0].getRange(1,1,3,1).setValues([
        ['Monthly archive spreadsheet'],
        ['Sheets are weekly snapshots of RANKING'],
        ['Do not edit archived data']
      ]);
    }
  } catch (e) {}

  return ss;
}


// ISO week number
function getISOWeekNumber_(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * 日次・週次ランキングをアーカイブする
 */
function archiveRankings() {
  archiveSheetToExternal_('RANKING_DAILY', 'Daily');
  archiveSheetToExternal_('RANKING_WEEKLY', 'Weekly');
}

/**
 * 指定したシートを月別アーカイブファイルへコピーする
 * @param {string} sourceSheetName 元シート名
 * @param {string} label アーカイブ後の接尾辞
 */
function archiveSheetToExternal_(sourceSheetName, label) {
  const PROJECT_PREFIX = 'TopKhmerBeats';
  const ARCHIVE_FOLDER_ID = ''; 

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(sourceSheetName);
  if (!src) {
    Logger.log(`${sourceSheetName} sheet not found. Skipping.`);
    return;
  }

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const archiveTitle = `${PROJECT_PREFIX}_Archive_${ym}`;
  const archiveSS = getOrCreateSpreadsheetByName_(archiveTitle, ARCHIVE_FOLDER_ID);

  let sheetName = `${ymd}_${label}`;
  let n = 2;
  while (archiveSS.getSheetByName(sheetName)) {
    sheetName = `${ymd}_${label}_${n++}`;
  }

  const data = src.getDataRange().getValues();
  if (!data || data.length < 2) return;

  const dst = archiveSS.insertSheet(sheetName);
  dst.getRange(1, 1, data.length, data[0].length).setValues(data);
  dst.setFrozenRows(1);
  Logger.log(`Archived ${sourceSheetName} -> ${archiveTitle} / ${sheetName}`);
}

/**
 * SNAPSHOTシートを外部へアーカイブする
 * (データビジネス・公共アーカイブ化に向けた長期保存用)
 */
function archiveSnapshot() {
  const PROJECT_PREFIX = 'TopKhmerBeats';
  const SOURCE_SHEET_NAME = 'SNAPSHOT';
  const ARCHIVE_FOLDER_ID = ''; 

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(SOURCE_SHEET_NAME);
  if (!src) return;

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const ym  = Utilities.formatDate(now, tz, 'yyyy-MM');
  const ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  const archiveTitle = `${PROJECT_PREFIX}_Snapshot_Archive_${ym}`;
  const archiveSS = getOrCreateSpreadsheetByName_(archiveTitle, ARCHIVE_FOLDER_ID);

  let sheetName = `${ymd}_Snap`;
  let n = 2;
  while (archiveSS.getSheetByName(sheetName)) {
    sheetName = `${ymd}_Snap_${n++}`;
  }

  const lastRow = src.getLastRow();
  const numRows = Math.min(lastRow, 10000); 
  if (numRows < 2) return;

  const data = src.getRange(lastRow - numRows + 1, 1, numRows, 5).getValues();
  const dst = archiveSS.insertSheet(sheetName);
  
  if (numRows < lastRow) {
    dst.getRange(1, 1, 1, 5).setValues([['date', 'videoId', 'views', 'likes', 'comments']]);
    dst.getRange(2, 1, data.length, 5).setValues(data);
  } else {
    dst.getRange(1, 1, data.length, 5).setValues(data);
  }

  dst.setFrozenRows(1);
  Logger.log(`Snapshot archived to ${archiveTitle}`);
}