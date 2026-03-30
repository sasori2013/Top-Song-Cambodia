/**
 * RANKING_DAILY シートを元に、AIによる命名正規化（クリーンアップ）のテストを実行する
 */
function testNamingNormalizationOnSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSh = ss.getSheetByName('RANKING_DAILY');
    if (!sourceSh) {
        throw new Error('RANKING_DAILY sheet not found');
    }

    // 1. テスト用シートの作成
    const testSheetName = 'TEST_NAMING_LOG';
    let testSh = ss.getSheetByName(testSheetName);
    if (testSh) {
        ss.deleteSheet(testSh);
    }
    testSh = ss.insertSheet(testSheetName);

    // 2. データの取得 (Top 20)
    const data = sourceSh.getDataRange().getValues();
    if (data.length < 2) {
        throw new Error('No data in RANKING_DAILY');
    }

    const headers = data[0];
    const findHeader = (names) => {
        for (let name of names) {
            const i = headers.findIndex(h => String(h || '').trim().toLowerCase() === name.toLowerCase());
            if (i !== -1) return i;
        }
        return -1;
    };

    const idx = {
        rank: findHeader(['順位', 'Rank', '順位(1d)', '順位(7d)']),
        artist: findHeader(['アーティスト', 'Artist', '歌手']),
        title: findHeader(['曲名', 'Title', 'タイトル']),
        videoId: findHeader(['videoId', 'Video ID', 'ID']),
        views: findHeader(['現在再生数', 'Total Views', 'Views', '再生数']),
        growth: findHeader(['成長率(%)', 'Growth %', 'Growth', '増加率']),
        heat: findHeader(['Heatスコア', 'Heat Score', 'Heat', '熱量'])
    };

    // 必須カラムのチェック
    if (idx.artist === -1 || idx.title === -1 || idx.videoId === -1) {
        throw new Error(`必要な列が見つかりません。 (Artist Index: ${idx.artist}, Title Index: ${idx.title}, VideoID Index: ${idx.videoId})`);
    }

    // Artist Role 情報を取得するための Artist シート
    const shArt = ss.getSheetByName('Artists');
    const artData = shArt ? shArt.getDataRange().getValues() : [];
    const roleMap = new Map();
    if (artData.length > 1) {
        for (let i = 1; i < artData.length; i++) {
            const name = String(artData[i][0] || "").trim();
            const role = String(artData[i][5] || "").trim().toUpperCase();
            roleMap.set(name, role);
        }
    }

    const candidates = [];
    for (let i = 1; i < Math.min(data.length, 21); i++) {
        const row = data[i];
        const artist = String(row[idx.artist] || "");
        candidates.push({
            id: String(row[idx.videoId] || ""),
            rank: row[idx.rank],
            artist: artist,
            title: String(row[idx.title] || ""),
            role: roleMap.get(artist) || "",
            views: row[idx.views],
            growth: row[idx.growth],
            heat: row[idx.heat]
        });
    }

    // 3. AI分析の実行
    Logger.log(`Testing normalization for ${candidates.length} songs...`);
    const aiResults = analyzeRankingWithAi(candidates, 'Test');

    // 4. 結果の書き込み
    const output = [
        ['Rank', 'Video ID', 'Original Artist', 'Original Title', 'Role', 'AI Normalized Artist', 'AI Normalized Title', 'AI Insight']
    ];

    if (!aiResults) {
        output.push(['ERROR', 'AI failed to return results', '', '', '', '', '', '']);
    } else {
        candidates.forEach(c => {
            const aiData = aiResults.get(String(c.id)) || aiResults.get(`${c.artist} - ${c.title}`);
            output.push([
                c.rank,
                c.id,
                c.artist,
                c.title,
                c.role,
                aiData ? cleanArtistName(aiData.artist) : '(No Data)',
                aiData ? aiData.title : '(No Data)',
                aiData ? aiData.shortInsight : '(No Data)'
            ]);
        });
    }

    testSh.getRange(1, 1, output.length, output[0].length).setValues(output);
    testSh.setFrozenRows(1);
    testSh.autoResizeColumns(1, output[0].length);
    SpreadsheetApp.getActiveSpreadsheet().toast('AI正規化テストが正常に完了しました。', '完了', 5);

    const msg = `テスト完了: シート「${testSheetName}」を作成しました。AIによる正規化結果を確認してください。`;
    try {
        SpreadsheetApp.getUi().alert(msg);
    } catch (e) {
        Logger.log(msg);
    }
}
