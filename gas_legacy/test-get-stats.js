function getTop2Stats() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('TEST_RANKING');
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    if (data.length < 3) return;

    // Headers: 0:日付 1:順位 2:PrevRank 3:アーティスト 4:曲名 5:公開日 6:トレンド(1d) 
    // 12:Heatスコア 13:コメ品質 14:成長率 15:反応率 16:増加数(1d) 17:現在再生数 18:1日前
    // Heat is at index 12. dv is at index 16. totalV is at index 17

    const headers = data[0];
    const keys = ['アーティスト', '曲名', 'Heatスコア', '増加数(1d)', '現在再生数'];

    const hMap = {};
    headers.forEach((h, i) => { hMap[h] = i; });

    for (let i = 1; i <= 2; i++) {
        const row = data[i];
        logToSheet_(`Rank ${i}: ${row[hMap['アーティスト']]} - ${row[hMap['曲名']]} | Heat: ${row[hMap['Heatスコア']]} | +Views: ${row[hMap['増加数(1d)']]} | TotalViews: ${row[hMap['現在再生数']]}`);
    }
}
