/**
 * Utils.js
 * Merged from NamingUtils.js, Migration_Links.js, and TTC.js
 */

/**
 * アーティスト名をクリーンアップする
 */
function cleanArtistName(name) {
    if (!name) return "";
    let cleaned = name.replace(/\s*Official\s*(Channel|YouTube|Music|Video|)\s*/gi, "");
    cleaned = cleaned.replace(/\s*(Production|Prod\.|Records|Entertainment)\s*/gi, "");
    return cleaned.trim();
}

/**
 * 曲名からアーティスト名や不要な修飾語を除去する
 */
function cleanSongTitle(title, artistName) {
    if (!title) return "";
    let cleaned = title;
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
        /『.*』/g,
    ];
    patterns.forEach(p => { cleaned = cleaned.replace(p, ''); });
    if (artistName) {
        const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const artistPatterns = [
            new RegExp(`^${escapedArtist}\\s*[-–:|]\\s*`, 'i'),
            new RegExp(`\\s*[-–:|]\\s*${escapedArtist}$`, 'i'),
            new RegExp(`^${escapedArtist}\\s+`, 'i'),
        ];
        artistPatterns.forEach(p => { cleaned = cleaned.replace(p, ''); });
    }
    cleaned = cleaned.replace(/^[-–:|]\s*/, '').replace(/\s*[-–:|]$/, '');
    return cleaned.trim();
}

/**
 * シート全体の命名をクリーンアップする
 */
function cleanupNaming() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shA = ss.getSheetByName(CFG.SHEET_ARTISTS);
    const shS = ss.getSheetByName(CFG.SHEET_SONGS);
    let artistCleanCount = 0;
    let songCleanCount = 0;

    if (shA) {
        const data = shA.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
            const originalName = String(data[i][0] || "").trim();
            let cleanedName = cleanArtistName(originalName);
            if (originalName && originalName !== cleanedName) {
                shA.getRange(i + 1, 1).setValue(cleanedName);
                artistCleanCount++;
            }
        }
    }
    if (shS) {
        const data = shS.getDataRange().getValues();
        const formulas = shS.getDataRange().getFormulas();
        for (let i = 1; i < data.length; i++) {
            const videoId = String(data[i][0] || "").trim();
            const artist = String(data[i][1] || "").trim();
            const originalTitle = String(data[i][2] || "").trim();
            const originalFormula = formulas[i][2];
            const cleanedTitle = cleanSongTitle(originalTitle, artist);
            if (videoId && cleanedTitle) {
                const videoUrl = "https://www.youtube.com/watch?v=" + videoId;
                const targetFormula = `=HYPERLINK("${videoUrl}", "${cleanedTitle.replace(/"/g, '""')}")`;
                if (originalFormula !== targetFormula) {
                    shS.getRange(i + 1, 3).setFormula(targetFormula);
                    songCleanCount++;
                }
            }
        }
    }
    const msg = `クリーンアップ完了:\nアーティスト: ${artistCleanCount} 件, 曲名: ${songCleanCount} 件`;
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/**
 * SONGSシートの既存データをHYPERLINK化する
 */
function migrateExistingSongsToLinks() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('SONGS');
  if (!sh) return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const range = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn());
  const data = range.getValues();
  for (let i = 0; i < data.length; i++) {
    const videoId = String(data[i][0]).trim();
    const title = String(data[i][2]).trim();
    if (title.startsWith('=') || title.includes('HYPERLINK')) continue;
    if (videoId && title) {
      const url = "https://www.youtube.com/watch?v=" + videoId;
      data[i][2] = `=HYPERLINK("${url}", "${title.replace(/"/g, '""')}")`;
    }
  }
  range.setValues(data);
}

/**
 * MC用の脚本を下書き生成する
 */
function buildMcScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("RANKING_DAILY") || ss.getSheetByName("RANKING");
  if (!sh) throw new Error("Ranking sheet not found");

  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("No ranking data");

  let script = ["Welcome to Top Khmer Beats.", "Here is this week’s ranking.", ""];
  for (let i = 1; i < data.length; i++) {
    const rank = data[i][1];
    const artist = data[i][3];
    const title = data[i][4];
    script.push(`Number ${rank}. ${artist} with ${title}.`);
    script.push("");
  }
  script.push("Analysis complete.");
  const output = ss.getSheetByName("MC_SCRIPT") || ss.insertSheet("MC_SCRIPT");
  output.clear();
  output.getRange(1,1,script.length,1).setValues(script.map(s=>[s]));
}
