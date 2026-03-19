/**
 * Reporting.js
 * Merged from GenerateReport.js and ReportService.js
 */

/**
 * 今日の業務内容を保存する。contentが指定されていればそれを使用し、
 * なければログから自動生成する。
 */
function generateAndSaveDailyReport(customContent) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd');
  const fileDateStr = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');

  let reportContent = customContent;

  if (!reportContent) {
    const shLog = ss.getSheetByName('DEBUG_LOG');
    let dailyLogs = [];
    if (shLog) {
      const logs = shLog.getDataRange().getValues();
      for (let i = logs.length - 1; i >= 1; i--) {
        const logDateStr = Utilities.formatDate(new Date(logs[i][0]), tz, 'yyyy/MM/dd');
        if (logDateStr === todayStr) {
          dailyLogs.push(`${Utilities.formatDate(new Date(logs[i][0]), tz, 'HH:mm:ss')} | ${logs[i][1]}`);
        } else if (dailyLogs.length > 0) break;
      }
      dailyLogs.reverse();
    }

    reportContent = `業務日報 - ${todayStr}\n================================\n\n【実行ログ（本日分）】\n${dailyLogs.join('\n')}\n\n(自動生成レポート)`;
  }

  // 4. 保存実行
  try {
    const fileName = `日報_${fileDateStr}_ランキング更新成功.txt`;
    const res = saveReportToHeatFolder_(reportContent, fileName);
    // UIがあればアラートを表示
    try {
      SpreadsheetApp.getUi().alert(`✅ 日報を保存しました！\n\n場所: HEAT > 日報\nファイル名: ${fileName}\n\nURL: ${res.url}`);
    } catch (e) {}
    
    return { success: true, url: res.url, fileName: fileName };
  } catch (e) {
    try {
      SpreadsheetApp.getUi().alert('❌ 保存エラー: ' + e.message);
    } catch (err) {}
    return { success: false, error: e.message };
  }
}

/**
 * 内部用：指定されたフォルダIDに日報ファイルを保存する
 */
function saveReportToHeatFolder_(content, fileName) {
  const targetFolderId = '1-T3b1IhAYA8Z6hY87i4QBbdRGxX9Vfyf';
  const dailyFolder = DriveApp.getFolderById(targetFolderId);
  const file = dailyFolder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  return { id: file.getId(), url: file.getUrl() };
}

/**
 * clasp run 用のヘッドレス保存
 */
function saveProjectReportDirect(content) {
  const tz = Session.getScriptTimeZone();
  const fileDateStr = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  const fileName = `日報_${fileDateStr}_プロジェクト完了報告.txt`;
  return saveReportToHeatFolder_(content, fileName);
}

/**
 * 埋め込まれたレポートデータを保存する (clasp run用)
 */
function saveFinalProjectReport() {
  if (typeof PROJECT_REPORT_WALKTHROUGH !== 'undefined') {
    return saveProjectReportDirect(PROJECT_REPORT_WALKTHROUGH);
  }
}

/**
 * 以前使用されていたGoogleドキュメント形式のレポート生成ツール（レガシー）
 */
function saveDailyReportLegacy() {
    const folderName = 'HEAT | 日報';
    const docTitle = 'AI修正とHeat計算式の調整 (02/28)';

    let destinationFolder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) destinationFolder = folders.next();
    else destinationFolder = DriveApp.createFolder(folderName);

    const doc = DocumentApp.create(docTitle);
    const body = doc.getBody();
    body.appendParagraph(docTitle).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('AIインサイト取得エラーの解決およびロジック最適化の記録。\n');
    doc.saveAndClose();

    const docFile = DriveApp.getFileById(doc.getId());
    destinationFolder.addFile(docFile);
    try { DriveApp.getRootFolder().removeFile(docFile); } catch (e) { }
    Logger.log('【完了】指定フォルダにGoogleドキュメントを作成しました: ' + doc.getUrl());
}
