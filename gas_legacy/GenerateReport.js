function saveDailyReport() {
    const folderName = 'HEAT | 日報';
    const docTitle = 'AI修正とHeat計算式の調整 (02/28)'; // 短いタイトル

    // 1. フォルダの取得または作成
    let destinationFolder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
        destinationFolder = folders.next();
    } else {
        destinationFolder = DriveApp.createFolder(folderName);
    }

    // 2. Googleドキュメントの作成
    const doc = DocumentApp.create(docTitle);
    const body = doc.getBody();

    // --- 見出しと本文の構成 ---
    body.appendParagraph(docTitle).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('この2日間で「AIインサイト取得エラーの解決」および「ランキング決定ロジック（Heat）の最適化」を行いました。\n');

    // Section 1
    body.appendParagraph('1. AIインサイトが取得できなかったエラーの解決').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendListItem('原因: 動画の概要欄などのテキストデータが多すぎたため、Gemini APIの処理上限（クォータ制限: 429エラー）に引っかかっていた。');
    body.appendListItem('対策①: AIへ渡す情報を「曲名」「アーティスト名」等に絞り込み、データ量を大幅に軽量化。');
    body.appendListItem('対策②: GAS側の抽出ロジック（正規表現）を、AIの回答フォーマット崩れに強い堅牢な構造に修正。');
    body.appendListItem('対策③: エラー時の自動リトライ回数を「最大5回」「最長待機1分」に延長強化。\n');

    // Section 2
    body.appendParagraph('2. ランキング生成ロジック（Heatスコア）のチューニング').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('新曲が過去のヒット曲に勝てない仕様を改善し、最新トレンドを反映する「直近熱量・超特化型」へ数式を変更。');
    body.appendListItem('変更点①: 過去の累計再生数のアドバンテージを「最大1.6倍のボーナス」程度まで大幅にフラット化。');
    body.appendListItem('変更点②: 今日の再生増加数（dv）を 5倍、いいね（dl）を 3倍、コメント（dc）を 5倍 の評価ウェイトにブースト。');
    body.appendParagraph('結果: 過去の総再生数に関わらず「今日一番再生され盛り上がっている新曲」が真っ当に1位を獲れる形に進化。\n');

    // Section 3
    body.appendParagraph('3. フロントエンドのUI対応（保留）').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('WebサイトのランキングカードへAIのインサイトテキストを表示する改修を実装・テストしたが、要望によりロールバックして非表示とした（データ自体は保持）。');

    doc.saveAndClose();

    // 3. 指定フォルダへファイルを移動する
    const docFile = DriveApp.getFileById(doc.getId());
    destinationFolder.addFile(docFile);
    // スクリプトの実行者がオーナー権限を持っていれば、ルートマイドライブから元の参照を外す
    try {
        DriveApp.getRootFolder().removeFile(docFile);
    } catch (e) {
        // 共有ドライブや権限の構成によっては不要な場合があるためスルー
    }

    Logger.log('【完了】指定フォルダにGoogleドキュメントを作成しました: ' + doc.getUrl());
}
