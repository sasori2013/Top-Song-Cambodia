function inspectState() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shArtists = ss.getSheetByName('ARTISTS');
  const shSongs = ss.getSheetByName('SONGS');
  const shSnap = ss.getSheetByName('SNAPSHOT');
  const shRank = ss.getSheetByName('RANKING_DAILY');
  
  const artistsCount = shArtists ? shArtists.getLastRow() : -1;
  const songsCount = shSongs ? shSongs.getLastRow() : -1;
  const snapCount = shSnap ? shSnap.getLastRow() : -1;
  const rankCount = shRank ? shRank.getLastRow() : -1;

  let rankData = "[]";
  if (shRank && rankCount > 0) {
    const data = shRank.getRange(1, 1, Math.min(3, rankCount), 5).getValues();
    rankData = JSON.stringify(data);
  }

  const result = {
    artistsCount,
    songsCount,
    snapCount,
    rankCount,
    rankData
  };
  
  Logger.log("INSPECT_STATE_OUTPUT: " + JSON.stringify(result));
}
