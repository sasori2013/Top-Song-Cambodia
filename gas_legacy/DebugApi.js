/**
 * 利用可能な Gemini モデルを一覧表示し、最適な設定を特定するためのデバッグ用スクリプト
 */
function debugGeminiModels() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();
    const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

    if (!key) {
        ui.alert('❌ GEMINI_API_KEY が設定されていません。');
        return;
    }

    let log = "=== Gemini Model Diagnostic ===\n";
    const versions = ['v1', 'v1beta'];

    versions.forEach(v => {
        log += `\n--- Checking API Version: ${v} ---\n`;
        const url = `https://generativelanguage.googleapis.com/${v}/models?key=${key}`;
        try {
            const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
            const code = response.getResponseCode();
            const content = response.getContentText();

            if (code === 200) {
                const json = JSON.parse(content);
                if (json.models && json.models.length > 0) {
                    const names = json.models.map(m => m.name);
                    log += `Found ${names.length} models:\n` + names.join('\n') + "\n";
                } else {
                    log += "No models found in this version.\n";
                }
            } else {
                log += `Error ${code}: ${content.substring(0, 100)}...\n`;
            }
        } catch (e) {
            log += `Exception: ${e.message}\n`;
        }
    });

    // 結果をダイアログとログに表示
    Logger.log(log);

    // シートにも出力（確実に確認できるように）
    let sh = ss.getSheetByName('DEBUG_API_LOG');
    if (sh) ss.deleteSheet(sh);
    sh = ss.insertSheet('DEBUG_API_LOG');
    sh.getRange(1, 1).setValue(log);
    sh.autoResizeColumns(1, 1);

    ui.alert('診断完了。シート「DEBUG_API_LOG」を確認してください。');
}
