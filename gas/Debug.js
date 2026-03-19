/**
 * Debug.js
 * Merged from DebugApi.js, TestNormalization.js, and test-get-stats.js
 */

/**
 * Gemini の利用可能なモデルを確認する
 */
function debugGeminiModels() {
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) return Logger.log('GEMINI_API_KEY not set');

    const versions = ['v1', 'v1beta'];
    versions.forEach(v => {
        const url = `https://generativelanguage.googleapis.com/${v}/models?key=${key}`;
        try {
            const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
            Logger.log(`[${v}] Code: ${res.getResponseCode()}, Body: ${res.getContentText().substring(0, 200)}`);
        } catch (e) { Logger.log(`[${v}] Exception: ${e.message}`); }
    });
}

/**
 * AIによる命名正規化のテストを実行する
 */
function testNamingNormalizationOnSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSh = ss.getSheetByName('RANKING_DAILY');
    if (!sourceSh) return;

    const data = sourceSh.getDataRange().getValues();
    if (data.length < 2) return;

    const testSh = ss.getSheetByName('TEST_NAMING_LOG') || ss.insertSheet('TEST_NAMING_LOG');
    testSh.clear();

    const candidates = [];
    for (let i = 1; i < Math.min(data.length, 11); i++) {
        candidates.push({
            id: String(data[i][23]), // videoId
            rank: data[i][1],
            artist: data[i][3],
            title: data[i][4],
            views: data[i][17]
        });
    }

    const aiResults = analyzeRankingWithAi(candidates, 'Test');
    const output = [['Rank', 'ID', 'Original Artist', 'Original Title', 'Normalized Artist', 'Normalized Title']];
    if (aiResults) {
        candidates.forEach(c => {
            const aiData = aiResults.get(String(c.id));
            output.push([c.rank, c.id, c.artist, c.title, aiData ? aiData.artist : '-', aiData ? aiData.title : '-']);
        });
    }
    testSh.getRange(1, 1, output.length, output[0].length).setValues(output);
}

/**
 * 上位曲の統計情報をログ出力する
 */
function getTop2Stats() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('RANKING_DAILY');
    if (!sh) return;
    const data = sh.getRange(1, 1, 3, sh.getLastColumn()).getValues();
    for (let i = 1; i <= 2; i++) {
        Logger.log(`Rank ${i}: ${data[i][3]} - ${data[i][4]} | Heat: ${data[i][12]} | Views: ${data[i][17]}`);
    }
}

const PROJECT_REPORT_WALKTHROUGH = `
# プロジェクト完了報告書 (Merged Debug)
Facebook自動投稿の遅延問題の解消、および管理システム（HUD）の最適化が完了しました。
(詳細はアーカイブ済)
`;
