function buildMcScript() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("RANKING");
  if (!sh) throw new Error("RANKING sheet not found");

  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("No ranking data");

  let script = [];

  script.push("Welcome to Top Khmer Beats.");
  script.push("Here is this week’s ranking.");
  script.push("");

  for (let i = 1; i < data.length; i++) {
    const rank = data[i][2];
    const artist = data[i][4];
    const title = data[i][5];
    const heat = data[i][6];
    const prev = data[i][11];

    script.push(`Number ${rank}.`);
    script.push(`${artist} with ${title}.`);

    // movement
    if (!prev || prev === "-" || prev === "") {
      script.push("New entry this week.");
    } else {
      const diff = prev - rank;
      if (diff > 0) script.push(`Up ${diff} positions.`);
      else if (diff < 0) script.push(`Down ${Math.abs(diff)} positions.`);
      else script.push("No change in position.");
    }

    // heat（4位以上だけ読みたい場合）
    if (rank <= 4) {
      script.push(`Heat level: ${heat}.`);
    }

    script.push("");
  }

  script.push("Analysis complete.");

  const output = ss.getSheetByName("MC_SCRIPT") || ss.insertSheet("MC_SCRIPT");
  output.clear();
  output.getRange(1,1,script.length,1).setValues(script.map(s=>[s]));
}