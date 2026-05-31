/**
 * resolve-apple-urls.mjs
 *
 * For artists without apple_music_url:
 *  1. Search iTunes with country=kh
 *  2. Among exact-name matches, fetch albums for each candidate
 *  3. Pick the one with the most albums in KH store
 *  4. Write best-guess URLs to Google Sheets (R column) for visual review
 *
 * Run: node scripts/releases/resolve-apple-urls.mjs [--dry-run]
 */

import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env.local') });

const DATASET = 'heat_ranking';
const DRY_RUN = process.argv.includes('--dry-run');

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

function createSheets() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return { client: google.sheets({ version: 'v4', auth }), sheetId: getEnv('NEXT_PUBLIC_SHEET_ID') };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status === 503) {
      const wait = 6000 * i;
      process.stdout.write(` [wait ${wait/1000}s]`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { if (i === retries) throw new Error(`JSON error: ${text.slice(0, 60)}`); await sleep(3000); }
  }
}

// Search iTunes for artist candidates (exact name match)
async function searchArtist(name) {
  const json = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&country=kh&limit=10`
  );
  return (json?.results || []).filter(r =>
    r.artistName.toLowerCase() === name.toLowerCase()
  );
}

// Count albums available in KH store for a given artist ID
async function countKhAlbums(artistId) {
  const json = await fetchJson(
    `https://itunes.apple.com/lookup?id=${artistId}&entity=album&country=kh&limit=50`
  );
  return (json?.results || []).filter(r =>
    r.wrapperType === 'collection' && r.trackCount > 1
  ).length;
}

async function main() {
  if (DRY_RUN) console.log('[DRY RUN]\n');

  const bq = createBQ();
  const { client: sheets, sheetId } = createSheets();

  // Fetch artists without apple_music_url from BQ
  const [artists] = await bq.query({ query: `
    SELECT name, channelId
    FROM \`${DATASET}.artists_master\`
    WHERE (apple_music_url IS NULL OR TRIM(apple_music_url) = '')
    ORDER BY name
  ` });
  console.log(`${artists.length} artists to resolve\n`);

  // Fetch all artist names+rows from Sheets to get row numbers
  const sheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Artists!A2:A',
  });
  const sheetNames = (sheetRes.data.values || []).map((r, i) => ({
    name: (r[0] || '').trim(),
    row: i + 2,
  }));

  const updates = []; // { row, url, artistName, confidence }

  for (const artist of artists) {
    await sleep(700);
    process.stdout.write(`  ${artist.name} ...`);

    const candidates = await searchArtist(artist.name);

    if (candidates.length === 0) {
      console.log(' not_found');
      continue;
    }
    if (candidates.length === 1) {
      // Already handled by fetch-itunes-releases as SEARCH, skip
      console.log(' single (already handled)');
      continue;
    }

    // Multiple candidates → score by KH album count
    const scored = [];
    for (const c of candidates) {
      await sleep(400);
      const count = await countKhAlbums(c.artistId);
      scored.push({ ...c, khAlbums: count });
    }
    scored.sort((a, b) => b.khAlbums - a.khAlbums);

    const best = scored[0];
    const second = scored[1];

    // Confident if best has KH albums and is clearly ahead
    const confident = best.khAlbums > 0 && best.khAlbums > second.khAlbums;

    const url = best.artistLinkUrl?.split('?')[0] || '';
    const sheetRow = sheetNames.find(s => s.name.toLowerCase() === artist.name.toLowerCase());

    if (confident && sheetRow && url) {
      console.log(` ✓ ${url} (${best.khAlbums} albums vs ${second.khAlbums})`);
      updates.push({ row: sheetRow.row, url, artistName: artist.name });
    } else if (best.khAlbums === 0) {
      console.log(` ✗ no KH albums for any candidate`);
    } else {
      console.log(` ? tie: ${best.khAlbums} vs ${second.khAlbums} — skipped`);
    }
  }

  console.log(`\n${updates.length} URLs resolved. Writing to Sheets...`);
  if (DRY_RUN) {
    updates.forEach(u => console.log(`  Row ${u.row} [${u.artistName}]: ${u.url}`));
    return;
  }

  // Batch write to Sheets (R column = index 17)
  const BATCH = 20;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const data = chunk.map(u => ({
      range: `Artists!R${u.row}`,
      values: [[u.url]],
    }));
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { valueInputOption: 'RAW', data },
    });
    await sleep(500);
  }
  console.log('Done.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
