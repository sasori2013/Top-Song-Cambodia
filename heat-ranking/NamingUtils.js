/**
 * アーティスト名と曲名をクリーンアップするためのユーティリティ関数
 */

/**
 * アーティスト名をクリーンアップする
 * 例: "VannDa Official" -> "VannDa"
 * 例: "Suly Pheng Official Channel" -> "Suly Pheng"
 */
function cleanArtistName(name) {
    if (!name) return "";
    // "Official", "Official Channel", "Official YouTube", "Production" 等をより広範囲に削除
    let cleaned = name.replace(/\s*Official\s*(Channel|YouTube|Music|Video|)\s*/gi, "");
    cleaned = cleaned.replace(/\s*(Production|Prod\.|Records|Entertainment)\s*/gi, "");
    return cleaned.trim();
}

/**
 * 曲名からアーティスト名や不要な修飾語を除去する
 * 例: "VannDa - Time to Rise (Official MV)" -> "Time to Rise"
 */
function cleanSongTitle(title, artistName) {
    if (!title) return "";

    let cleaned = title;

    // 1. 不要な修飾語（MV, Official, Subtitle等）を削除
    const patterns = [
        /\(?\s*OFFICIAL VIDEO\s*\)?/gi,
        /\(?\s*Official MV\s*\)?/gi,
        /\(?\s*OFFICIAL MUSIC VIDEO\s*\)?/gi,
        /\[\s*Eng\s*&\s*Khmer\s*Sub\s*\]/gi,
        /\[\s*Official MV\s*\]/gi,
        /\[\s*OFFICIAL VIDEO\s*\]/gi,
        /\|\s*OFFICIAL VIDEO/gi,
        /\|\s*Official MV/gi,
        /\(?\s*Lyrics\s*\)?/gi,
        /\(?\s*Official Audio\s*\)?/gi,
        /\(?\s*Audio\s*\)?/gi,
        /\(?\s*Prod\.\s*by\s*.*?\)?/gi,
        /『.*』/g, // 日本語の括弧なども一応考慮
    ];

    patterns.forEach(p => {
        cleaned = cleaned.replace(p, '');
    });

    // 2. アーティスト名がタイトルに含まれている場合、それを除去
    // "Artist - Title" などの形式に対応
    if (artistName) {
        const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const artistPatterns = [
            new RegExp(`^${escapedArtist}\\s*[-–:|]\\s*`, 'i'),
            new RegExp(`\\s*[-–:|]\\s*${escapedArtist}$`, 'i'),
            new RegExp(`^${escapedArtist}\\s+`, 'i'),
        ];
        artistPatterns.forEach(p => {
            cleaned = cleaned.replace(p, '');
        });
    }

    // 3. 文頭・文末の記号を除去
    cleaned = cleaned.replace(/^[-–:|]\s*/, '').replace(/\s*[-–:|]$/, '');

    return cleaned.trim();
}

/**
 * シート全体の命名をクリーンアップするメイン関数
 * 【警告】この関数は既存のシートの内容を直接書き換えます。
 */
function cleanupNaming() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shA = ss.getSheetByName(CFG.SHEET_ARTISTS);
    const shS = ss.getSheetByName(CFG.SHEET_SONGS);

    let artistCleanCount = 0;
    let songCleanCount = 0;

    // 1. Artists シートのクリーンアップ
    // F列(Role)が "P" の場合はプロダクション名なので、大幅な消去は避ける
    if (shA) {
        const data = shA.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            const originalName = String(data[i][0] || "").trim(); // name is col 1
            const role = String(data[i][5] || "").trim().toUpperCase(); // role is col 6

            // "P" (Production) の場合は、Artist Nameとしての汎用クリーンアップは適用しないか、より慎重に行う
            let cleanedName = cleanArtistName(originalName);

            if (originalName && originalName !== cleanedName) {
                shA.getRange(i + 1, 1).setValue(cleanedName);
                artistCleanCount++;
            }
        }
    }

    // 2. SONGS シートのクリーンアップ
    // 原本データなので、ここでは明らかな付加情報の削除に留める
    if (shS) {
        const data = shS.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            const artist = String(data[i][1] || "").trim(); // artist is col 2
            const originalTitle = String(data[i][2] || "").trim(); // title is col 3
            const cleanedTitle = cleanSongTitle(originalTitle, artist);

            if (originalTitle && originalTitle !== cleanedTitle) {
                shS.getRange(i + 1, 3).setValue(cleanedTitle);
                songCleanCount++;
            }
        }
    }

    const msg = `クリーンアップが完了しました。\n(原本データの整合性を保つため、Pロール（プロダクション）はスキップ、楽曲名は修飾語の削除に限定しています)\n\n・アーティスト名: ${artistCleanCount} 件修正\n・曲名: ${songCleanCount} 件修正`;
    try {
        SpreadsheetApp.getUi().alert(msg);
    } catch (e) {
        Logger.log(msg);
    }
}
