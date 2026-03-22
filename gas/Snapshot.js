function snapshotStats() {
  logToSheet_('【実行】snapshotStats 開始');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shSongs = ss.getSheetByName('SONGS');
  const shSnap = ss.getSheetByName('SNAPSHOT');
  if (!shSongs) throw new Error('SONGS sheet not found');
  if (!shSnap) throw new Error('SNAPSHOT sheet not found');

  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // ヘッダー
  if (shSnap.getLastRow() === 0) {
    shSnap.appendRow(['date', 'videoId', 'views', 'likes', 'comments']);
  } else {
    const h = shSnap.getRange(1, 1, 1, 5).getValues()[0];
    if (String(h[0]) !== 'date' || String(h[1]) !== 'videoId') {
      // 既存があっても壊さない：先頭にヘッダー行だけ入れる
      shSnap.insertRowBefore(1);
      shSnap.getRange(1, 1, 1, 5).setValues([['date', 'videoId', 'views', 'likes', 'comments']]);
    }
  }

  // SONGS A列から videoId 取得
  const songVals = shSongs.getDataRange().getValues();
  const ids = [];
  const rowMap = new Map();
  for (let i = 1; i < songVals.length; i++) {
    const id = String(songVals[i][0] || '').trim();
    if (id) {
      ids.push(id);
      rowMap.set(id, { row: i + 1, title: String(songVals[i][2] || 'Unknown') });
    }
  }
  if (!ids.length) {
    Logger.log('No videoIds in SONGS');
    return;
  }

  // 今日すでに取ったvideoIdはスキップ
  const snapVals = shSnap.getDataRange().getValues();
  const already = new Set();
  for (let i = 1; i < snapVals.length; i++) {
    const rawDate = snapVals[i][0];
    const dk = toDateKey_(rawDate, tz);
    const id = String(snapVals[i][1] || '').trim();
    if (dk === todayKey && id) already.add(id);
  }
  const targets = ids.filter(id => !already.has(id));
  if (!targets.length) {
    Logger.log(`Already captured today: ${todayKey}`);
    return;
  }

  const rows = [];
  const missingVideos = [];
  for (const chunk of chunk_(targets, 50)) {
    const res = YouTube.Videos.list('statistics', { id: chunk.join(',') });
    updateApiUsage_('YouTube', 1); // 1 unit per 50 videos
    const items = (res && res.items) ? res.items : [];

    // 取得できなかった（削除・非公開）動画を判定し、赤色にマークする
    const returnedIds = new Set(items.map(it => it.id));
    chunk.forEach(id => {
      if (!returnedIds.has(id)) {
        const info = rowMap.get(id);
        if (info) {
          missingVideos.push({ id, title: info.title, row: info.row });
          // 該当行の背景色を赤（#FFCCCC）に設定
          shSongs.getRange(info.row, 1, 1, shSongs.getLastColumn()).setBackground('#FFCCCC');
        }
      }
    });

    for (const it of items) {
      const st = it.statistics || {};
      rows.push([
        todayKey,
        it.id,
        Number(st.viewCount || 0),
        Number(st.likeCount || 0),
        Number(st.commentCount || 0),
      ]);
    }
  }

  if (rows.length) {
    shSnap.getRange(shSnap.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  }
  Logger.log(`Snapshot added: ${rows.length} (${todayKey})`);

  // 取得不可だった動画があればTelegramへ通知
  if (missingVideos.length > 0) {
    let msg = `【警告】YouTubeから取得できない動画が ${missingVideos.length} 件ありました。\n` +
      `※削除されたか非公開になった可能性があります。\n\n`;
    missingVideos.forEach(v => {
      msg += `- ${v.title}\n  https://youtu.be/${v.id}\n`;
    });
    msg += `\n「SONGS」シートの該当行を赤（#FFCCCC）に塗りつぶしました。確認の上、手動で削除してください。`;

    if (typeof sendTelegramNotification_ === 'function') {
      sendTelegramNotification_(msg);
    }
  }
}

function chunk_(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 汎用的な日付キーへの変換 (yyyy-MM-dd)
 */
function toDateKey_(v, tz) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return s;
}

/**
 * SNAPSHOTシート内の同じ日・同じビデオIDの重複行を削除する
 */
function cleanupSnapshotDuplicates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('SNAPSHOT');
  if (!sh) return;

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return;

  const tz = Session.getScriptTimeZone();
  const seen = new Set();
  const keepRows = [data[0]]; // ヘッダー
  let deleteCount = 0;

  for (let i = 1; i < data.length; i++) {
    const dk = toDateKey_(data[i][0], tz);
    const id = String(data[i][1] || '').trim();
    const key = `${dk}_${id}`;

    if (seen.has(key)) {
      deleteCount++;
      continue;
    }
    seen.add(key);
    keepRows.push(data[i]);
  }

  if (deleteCount > 0) {
    sh.clear();
    sh.getRange(1, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
    SpreadsheetApp.getUi().alert(`SNAPSHOTの清掃完了\n\n重複していた ${deleteCount} 件のデータを削除しました。`);
  } else {
    SpreadsheetApp.getUi().alert('重複データは見つかりませんでした。');
  }
}