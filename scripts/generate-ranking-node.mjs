import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { sendTelegramNotification } from './telegram-node.mjs';
import { updateProcessStatus } from './process-tracker.mjs';
import { validateKhmerSong, loadBlocklist } from './validate-khmer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_SNAPSHOTS = 'snapshots';
const TABLE_HISTORY = 'rank_history';

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON missing');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

/**
 * EXACT REPLICA of GAS calculateHeatScore_ (PickSongs.js L885-910)
 */
function calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, qFactor = 1.0) {
  // scale based on total views (PickSongs.js L874)
  const scale = 1 + (Math.log10(totalV + 1) / 10);
  
  // dailyViewCore (L899)
  const dailyViewCore = (5 * Math.log(dv + 1)) + (dv / 10000);
  const baseViewScore = dailyViewCore * scale;
  
  // reactionScore (いいね 3倍, コメ 5倍 + 品質因子) (L905)
  const reactionScore = (3 * Math.log(dl + 1)) + (5 * Math.log(dc + 1) * qFactor);
  
  // momentumBonus (L908)
  const momentumBonus = Math.min(5, growthRate * 5) + Math.min(5, engagement * 100);
  
  return baseViewScore + reactionScore + momentumBonus;
}

async function runRankingNode() {
  const args = process.argv.slice(2);
  const forcedDate = args.find(a => a.startsWith('--date='))?.split('=')[1];
  const forcedBase = args.find(a => a.startsWith('--base='))?.split('=')[1];

  console.log('--- Ranking Generation (Node.js) Started ---');
  await sendTelegramNotification(`🔥 <b>デイリーランキング生成 (generateRanking)</b> を開始します...${forcedDate ? `\n(指定日: ${forcedDate})` : ''}`);
  await updateProcessStatus('Ranking: Analyzing Data', 0, 100);

  let latestDate, baseDate;
  
  // 1. Get the two most recent snapshot dates
  const [dateRows] = await bq.query(`
    SELECT date, COUNT(videoId) as count
    FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\`
    GROUP BY date ORDER BY date DESC LIMIT 7
  `);

  const allDates = dateRows.map(r => r.date.value);

  if (allDates.length < 2) {
    throw new Error('Not enough snapshot dates found (need at least 2).');
  }

  if (forcedDate) {
    latestDate = forcedDate;
  } else {
    latestDate = allDates[0];
  }

  if (forcedBase) {
    baseDate = forcedBase;
  } else {
    baseDate = allDates.find(d => d < latestDate) || allDates[1];
  }

  const latestCount = Number(dateRows.find(r => r.date.value === latestDate)?.count || 0);
  const baseCount   = Number(dateRows.find(r => r.date.value === baseDate)?.count   || 0);
  console.log(`Analyzing: ${latestDate} (${latestCount} records) vs ${baseDate} (${baseCount} records)`);

  // Alert if count is suspiciously low (possible full API failure)
  if (latestCount < 50) {
    await sendTelegramNotification(
      `🚨 <b>スナップショット異常</b>\n` +
      `${latestDate} のレコード数が ${latestCount} 件と極端に少ないです。APIエラーの可能性があります。`
    );
    throw new Error(`Snapshot for ${latestDate} has only ${latestCount} records — aborting.`);
  }

  // Day normalization: if base is 2+ days ago, divide increments by elapsed days
  const daysBetween = Math.max(1, Math.round(
    (new Date(latestDate) - new Date(baseDate)) / (1000 * 60 * 60 * 24)
  ));
  if (daysBetween > 1) console.warn(`⚠️ Base date is ${daysBetween} days ago — normalizing increments per day.`);

  console.log(`Analyzing: ${latestDate} (Latest) vs ${baseDate} (Base)`);

  // 2. Query snapshots for these two dates
  const sql = `
    WITH latest AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${latestDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    base AS (
        SELECT * FROM \`${DATASET_ID}.${TABLE_SNAPSHOTS}\` 
        WHERE CAST(date AS STRING) = '${baseDate}'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY views DESC) = 1
    ),
    history AS (
        -- Get previous rank from history table if available
        SELECT videoId, rank as prevRank 
        FROM \`${DATASET_ID}.${TABLE_HISTORY}\` 
        WHERE CAST(date AS STRING) = '${baseDate}' AND UPPER(type) = 'DAILY'
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY rank ASC) = 1
    ),
    songs_master_dedup AS (
        SELECT * FROM \`${DATASET_ID}.songs_master\`
        QUALIFY ROW_NUMBER() OVER(PARTITION BY videoId ORDER BY publishedAt DESC) = 1
    )
    SELECT
      l.videoId,
      l.views as totalV, l.likes as totalL, l.comments as totalC,
      b.views as baseV, b.likes as baseL, b.comments as baseC,
      l.qualityScore,
      h.prevRank,
      s.publishedAt, s.eventTag, s.category,
      s.artist, s.title, s.cleanTitle, s.detectedArtist
    FROM latest l
    LEFT JOIN base b ON l.videoId = b.videoId
    LEFT JOIN history h ON l.videoId = h.videoId
    JOIN songs_master_dedup s ON l.videoId = s.videoId
    WHERE s.publishedAt >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
  `;
  const [rows] = await bq.query(sql);
  console.log(`Fetched ${rows.length} records.`);

  // 3. Artists sheet (Facebook URLs) + BLOCKLIST
  const [resArtists, blocklist] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:E' }),
    loadBlocklist(sheets, SHEET_ID),
  ]);
  const artistMeta = new Map();
  (resArtists.data.values || []).forEach(r => {
    if (r[0]) artistMeta.set(r[0].trim(), { subs: parseInt(r[3]) || 0, fb: r[4] });
  });

  await updateProcessStatus('Ranking: Calculating Scores', 20, 100);

  // 総再生数が少なすぎる動画を除外（ベースが浅くて成長率が爆発するケースを防ぐ）
  const MIN_TOTAL_VIEWS = 10000;
  // この再生数以上のbaseでlikes=0はAPIエラーによる欠損と判定
  const MIN_RELIABLE_BASE_VIEWS = 5000;

  const eligibleRows = rows.filter(row => {
    if (parseInt(row.totalV) < MIN_TOTAL_VIEWS) {
      console.log(`[MinViews] Skip ${row.videoId}: totalV=${row.totalV}`);
      return false;
    }
    return true;
  });
  console.log(`MinViews filter: ${rows.length} → ${eligibleRows.length} songs`);

  const rankedList = eligibleRows.map(row => {
    const totalV = parseInt(row.totalV);
    const totalL = parseInt(row.totalL);
    const totalC = parseInt(row.totalC);

    const baseV = (row.baseV != null) ? parseInt(row.baseV) : null;
    const baseL_raw = (row.baseL != null) ? parseInt(row.baseL) : 0;
    const baseC_raw = (row.baseC != null) ? parseInt(row.baseC) : 0;

    // ベーススナップショットのlikes/comments欠損検知:
    // 再生数が十分ある楽曲でbaseL=0はAPIエラーの可能性が高いのでdl/dcを0に抑制
    const corruptedBase = baseV !== null && baseV >= MIN_RELIABLE_BASE_VIEWS && baseL_raw === 0;
    if (corruptedBase) {
      console.warn(`[CorruptedBase] ${row.videoId}: baseV=${baseV}, baseL=0 → dl/dc suppressed`);
    }
    const baseL = corruptedBase ? totalL : baseL_raw;
    const baseC = corruptedBase ? totalC : baseC_raw;

    const rawDv = baseV !== null ? Math.max(0, totalV - baseV) : 0;
    const dv = rawDv / daysBetween;
    const dl = Math.max(0, totalL - baseL) / daysBetween;
    const dc = Math.max(0, totalC - baseC) / daysBetween;
    const growthRate = (baseV !== null && baseV > 0) ? dv / baseV : (dv > 0 ? 1.0 : 0);
    const engagement = totalV > 0 ? (totalL + totalC) / totalV : 0;
    const qFactor = row.qualityScore || 1.0;
    
    const heat = calculateHeatScore(dv, dl, dc, totalV, growthRate, engagement, qFactor);
    const baseArtist = (row.artist || '').trim();
    const detected = (row.detectedArtist || '').trim();
    // detectedArtist is the real performing artist (set when channel is a production label).
    // Prefer it over the channel name whenever it's populated.
    const finalArtist = detected || baseArtist;
    const displayTitle = (row.cleanTitle || '').trim() || (row.title || '').trim();
    const meta = {
      artist: finalArtist || 'Unknown',
      title: displayTitle || 'Unknown',
      publishedAt: row.publishedAt?.value || row.publishedAt || ''
    };
    const aMeta = artistMeta.get(meta.artist) || { subs: 0, fb: '' };

    return {
      ...row,
      ...meta,
      ...aMeta,
      dv, dl, dc, growthRate, engagement, heat
    };
  });

  rankedList.sort((a, b) => b.heat - a.heat);

  // Deduplicate: same cleanTitle from production + personal accounts → keep highest heat only
  const seenTitles = new Set();
  const deduped = rankedList.filter(item => {
    const key = (item.title || '')
      .toLowerCase()
      .replace(/[\s​ ?!.,:;()\[\]{}'"""''「」『』・、。！？]+/g, '');
    if (!key) return true;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
  console.log(`Deduplication: ${rankedList.length} → ${deduped.length} songs`);

  // Layer 2: カンボジア楽曲バリデーション (BLOCKLIST + 外国語スクリプト検出)
  const rejected = [];
  const validated = deduped.filter(item => {
    const result = validateKhmerSong(item.artist, item.title, item.videoId, blocklist);
    if (!result.valid) {
      rejected.push({ videoId: item.videoId, artist: item.artist, title: item.title, reason: result.reason });
      return false;
    }
    return true;
  });
  if (rejected.length > 0) {
    console.warn(`[Layer2] Rejected ${rejected.length} non-Khmer songs:`, rejected.map(r => `${r.videoId}(${r.reason})`).join(', '));
    await sendTelegramNotification(
      `⚠️ <b>[Layer2] 非クメール楽曲を除外しました</b>\n` +
      rejected.map(r => `• <code>${r.videoId}</code> ${r.artist} - ${r.title}\n  → ${r.reason}`).join('\n')
    );
  }

  // 4.5 Abnormal Ranking detection
  if (validated.length > 0 && validated[0].heat < 40) {
    await sendTelegramNotification(
      `🚨 <b>ランキング異常警報 (generateRanking)</b>\n` +
      `本日のランク1位のスコアが <b>${Math.round(validated[0].heat * 100) / 100}</b> と非常に低いです。\n` +
      `データの不整合（昨日のデータ欠落など）が発生している可能性があります。確認してください。`
    );
  }

  const top40 = validated.slice(0, 40);

  // 5. Build Output (27 columns)
  const output = top40.map((x, i) => [
    latestDate,
    i + 1, // rank
    x.prevRank || '-',
    x.artist,
    x.title,
    x.publishedAt || '',
    '', // spark
    '-', // aiScore
    '-', // aiReason
    '-', // aiInsight
    '-', // shortInsight
    x.eventTag || '-', // genre
    x.category || '-', // visualConcept
    Math.round(x.heat * 100) / 100,
    Math.round((x.qualityScore || 1.0) * 100) + '%',
    Math.round(x.growthRate * 10000) / 100 + '%',
    Math.round(Math.min(1.0, x.engagement) * 10000) / 100 + '%',
    x.dv,
    x.dl,
    x.dc,
    x.totalV,
    x.baseV || 0,
    `https://youtu.be/${x.videoId}`,
    x.fb ? `=HYPERLINK("${x.fb}","Facebook")` : '',
    '', // alert
    x.videoId
  ]);

  // 6. Update RANKING_DAILY
  if (output.length > 0) {
    // Clear first
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'RANKING_DAILY!A2:AA41',
      valueInputOption: 'RAW',
      requestBody: { values: Array(40).fill(Array(27).fill('')) },
    });
    // Write new
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `RANKING_DAILY!A2:AA${output.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: output },
    });
    console.log(`Updated RANKING_DAILY with ${output.length} items.`);
    await updateProcessStatus('Ranking: Recording History', 80, 100);

    // 7. Record Rank History in BigQuery
    const historyRows = top40.map((x, i) => ({
      date: latestDate,
      videoId: x.videoId,
      type: 'DAILY',
      rank: i + 1,
      heatScore: Math.round(x.heat * 100) / 100
    }));

    // NEW: Delete existing records for the same date and type to prevent duplicates
    console.log(`Deleting existing ranking records for ${latestDate} (DAILY)...`);
    await bq.query(`DELETE FROM \`${DATASET_ID}.${TABLE_HISTORY}\` WHERE date = '${latestDate}' AND type = 'DAILY'`);

    const tempFilePath = join(os.tmpdir(), `history_${latestDate}_${Date.now()}.json`);
    const ndjson = historyRows.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(tempFilePath, ndjson);

    await bq.dataset(DATASET_ID).table(TABLE_HISTORY).load(tempFilePath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    fs.unlinkSync(tempFilePath);
    console.log('Recorded rank history in BigQuery.');

    // 8. Record Rank History in Spreadsheet (RANK_HISTORY)
    const sheetHistoryRows = historyRows.map(h => [h.date, h.videoId, h.type, h.rank, h.heatScore]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RANK_HISTORY!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: sheetHistoryRows },
    });
    console.log(`Appended ${sheetHistoryRows.length} rows to RANK_HISTORY sheet.`);
  }

  // ── HEAT POINT RANKING (cross-platform) ──────────────────────────────────────
  console.log('\n--- HEAT POINT RANKING (cross-platform) ---');
  await updateProcessStatus('Ranking: Cross-Platform', 85, 100);

  try {
    // 9a. Fetch Apple Music & Spotify ranks from sheets (always up-to-date)
    // Columns: Rank(0), Title(1), Artist(2), URL(3), Artwork(4), Album(5), Genre(6), Date(7), YouTube VideoID(8)
    const [amSheet, spSheet] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AM_RANKING!A2:I' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SP_RANKING!A2:I' }),
    ]);

    const amRankMap = new Map();
    const spRankMap = new Map();
    const AM_CHART_SIZE = 100;
    const SP_CHART_SIZE = 50;

    for (const row of (amSheet.data.values || [])) {
      const vid = (row[8] || '').trim();
      const rank = parseInt(row[0]);
      if (vid && rank) amRankMap.set(vid, rank);
    }
    for (const row of (spSheet.data.values || [])) {
      const vid = (row[8] || '').trim();
      const rank = parseInt(row[0]);
      if (vid && rank) spRankMap.set(vid, rank);
    }
    console.log(`Platform data (from sheets): AM ${amRankMap.size} linked, SP ${spRankMap.size} linked`);

    // 9b. Fetch FB engagement per song (last 14 days) — skip gracefully if table missing
    const fbMap = new Map();
    try {
      const [fbRows] = await bq.query(`
        SELECT
          song_id AS videoId,
          SUM(COALESCE(reactions, 0)) AS reactions,
          SUM(COALESCE(comments,  0)) AS comments,
          SUM(COALESCE(shares,    0)) AS shares
        FROM \`${DATASET_ID}.fb_posts\`
        WHERE song_id IS NOT NULL
          AND DATE(scraped_at) >= DATE_SUB('${latestDate}', INTERVAL 14 DAY)
          AND ai_category IN ('new_release', 'yt_share', 'promo')
        GROUP BY song_id
      `);
      for (const r of fbRows) {
        fbMap.set(r.videoId, {
          reactions: Number(r.reactions),
          comments:  Number(r.comments),
          shares:    Number(r.shares),
        });
      }
      console.log(`FB data: ${fbMap.size} songs with engagement`);
    } catch (fbErr) {
      console.warn(`[HEAT POINT] FB query skipped: ${fbErr.message.split('\n')[0]}`);
    }

    // 9c. Apply platform bonuses to all validated songs and re-rank
    const AM_WEIGHT = 25;
    const SP_WEIGHT = 20;
    const FB_WEIGHT = 2.5;

    // YT Rank = position in pure YouTube daily ranking (before platform bonuses)
    const ytRankMap = new Map();
    validated.forEach((x, i) => ytRankMap.set(x.videoId, i + 1));

    const heatRanked = validated.map(x => {
      const amRank = amRankMap.get(x.videoId) ?? null;
      const spRank = spRankMap.get(x.videoId) ?? null;
      const fb     = fbMap.get(x.videoId) ?? null;

      const amBonus = amRank != null ? (1 - amRank / (AM_CHART_SIZE + 1)) * AM_WEIGHT : 0;
      const spBonus = spRank != null ? (1 - spRank / (SP_CHART_SIZE + 1)) * SP_WEIGHT : 0;
      const fbBonus = fb
        ? Math.log(fb.reactions + fb.comments * 2 + fb.shares * 3 + 1) * FB_WEIGHT
        : 0;

      const heatPoint = x.heat + amBonus + spBonus + fbBonus;
      const ytRank = ytRankMap.get(x.videoId) ?? null;
      return { ...x, heatPoint, ytRank, amRank, spRank, amBonus, spBonus, fbBonus };
    });

    heatRanked.sort((a, b) => b.heatPoint - a.heatPoint);
    const top40Heat = heatRanked.slice(0, 40);

    // 9d. Write to HEAT_POINT_RANKING sheet
    const HEAT_SHEET = 'HEAT_POINT_RANKING';
    const HEAT_HEADERS = [
      'Date', 'Rank', 'Artist', 'Title',
      'HEAT Score', 'YT Score', 'YT Rank', 'AM Rank', 'AM Bonus', 'SP Rank', 'SP Bonus', 'FB Bonus',
      'YouTube URL', 'VideoID',
    ];

    const sheetsMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingTab = sheetsMeta.data.sheets.find(s => s.properties.title === HEAT_SHEET);
    if (!existingTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: HEAT_SHEET } } }] },
      });
      console.log(`[Sheets] Created tab: ${HEAT_SHEET}`);
    }
    // Always sync header row to keep it consistent with code
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${HEAT_SHEET}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEAT_HEADERS] },
    });

    const heatOutput = top40Heat.map((x, i) => [
      latestDate,
      i + 1,
      x.artist,
      x.title,
      Math.round(x.heatPoint * 100) / 100,
      Math.round(x.heat     * 100) / 100,
      x.ytRank  ?? '-',
      x.amRank  ?? '-',
      Math.round(x.amBonus  * 100) / 100,
      x.spRank  ?? '-',
      Math.round(x.spBonus  * 100) / 100,
      Math.round(x.fbBonus  * 100) / 100,
      `https://youtu.be/${x.videoId}`,
      x.videoId,
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${HEAT_SHEET}'!A2:N41`,
      valueInputOption: 'RAW',
      requestBody: { values: Array(40).fill(Array(14).fill('')) },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${HEAT_SHEET}'!A2:N${heatOutput.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: heatOutput },
    });
    console.log(`Updated ${HEAT_SHEET} with ${heatOutput.length} items.`);

    // 9e. Record in rank_history (type = 'HEAT')
    await bq.query(`DELETE FROM \`${DATASET_ID}.${TABLE_HISTORY}\` WHERE date = '${latestDate}' AND type = 'HEAT'`);

    const heatHistoryRows = top40Heat.map((x, i) => ({
      date: latestDate,
      videoId: x.videoId,
      type: 'HEAT',
      rank: i + 1,
      heatScore: Math.round(x.heatPoint * 100) / 100,
    }));

    const heatTempPath = join(os.tmpdir(), `heat_history_${latestDate}_${Date.now()}.json`);
    fs.writeFileSync(heatTempPath, heatHistoryRows.map(r => JSON.stringify(r)).join('\n'));
    await bq.dataset(DATASET_ID).table(TABLE_HISTORY).load(heatTempPath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    fs.unlinkSync(heatTempPath);

    const heatSheetHistoryRows = heatHistoryRows.map(h => [h.date, h.videoId, h.type, h.rank, h.heatScore]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'RANK_HISTORY!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: heatSheetHistoryRows },
    });
    console.log(`Appended ${heatSheetHistoryRows.length} HEAT rows to RANK_HISTORY.`);

    const amCount = top40Heat.filter(x => x.amRank != null).length;
    const spCount = top40Heat.filter(x => x.spRank != null).length;
    const fbCount = top40Heat.filter(x => x.fbBonus > 0).length;
    await sendTelegramNotification(
      `🏆 <b>HEAT POINT RANKING 生成完了</b>\n` +
      `Top 40 | AM加算: ${amCount}曲 / SP加算: ${spCount}曲 / FB加算: ${fbCount}曲`
    );
  } catch (e) {
    console.error('[HEAT POINT] Failed:', e.message);
    await sendTelegramNotification(`⚠️ <b>HEAT POINT RANKING エラー</b>\n<code>${e.message}</code>`);
  }

  console.log('--- Ranking Generation (Node.js) Completed ---');
  await updateProcessStatus('Ranking: Completed', 100, 100, 'completed');
  await sendTelegramNotification(`✅ <b>ランキング作成完了</b>\nTop 40 の生成とシート書込に成功しました。\n(比較対象: ${baseDate})`);
}

runRankingNode().catch(async (error) => {
    console.error(error);
    await sendTelegramNotification(`⚠️ <b>ランキング生成エラー</b>\n<code>${error.message}</code>`);
});
