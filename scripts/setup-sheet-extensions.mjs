/**
 * setup-sheet-extensions.mjs
 * 
 * Step 1: Add new column headers to Artists, SONGS, SONGS_LONG sheets.
 * Step 2: Initialize the Type column (M) in Artists sheet for all existing rows.
 *         F = 'P' → 'Label', otherwise → 'Artist'
 * 
 * SAFETY: This script only writes to NEW columns (M, N on Artists; G on SONGS/SONGS_LONG).
 *         Existing columns A-L are never touched.
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON or NEXT_PUBLIC_SHEET_ID missing');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// ─── DRY RUN FLAG ─────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY RUN MODE — no writes will happen\n');

async function safeUpdate(range, values, description) {
  console.log(`  [${DRY_RUN ? 'DRY' : 'WRITE'}] ${description}`);
  console.log(`    Range: ${range}, Values: ${JSON.stringify(values)}`);
  if (!DRY_RUN) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
}

async function main() {
  console.log('=== Setup Sheet Extensions ===\n');

  // ─── STEP 1: Verify current headers (read-only, safe) ─────────────────────
  console.log('Step 1: Reading current headers...');
  const [rArtists, rSongs, rSongsLong] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A1:N1' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS!A1:G1' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'SONGS_LONG!A1:G1' }),
  ]);

  const artistsHeader = rArtists.data.values?.[0] || [];
  const songsHeader = rSongs.data.values?.[0] || [];
  const songsLongHeader = rSongsLong.data.values?.[0] || [];

  console.log('  Artists headers:', JSON.stringify(artistsHeader));
  console.log('  SONGS headers:', JSON.stringify(songsHeader));
  console.log('  SONGS_LONG headers:', JSON.stringify(songsLongHeader));

  // Safety check: ensure existing columns are intact
  if (artistsHeader[0] !== 'Artist Name') {
    console.error('❌ ABORT: Artists!A1 is not "Artist Name". Sheet structure unexpected!');
    process.exit(1);
  }
  if (songsHeader[0] !== 'videoId') {
    console.error('❌ ABORT: SONGS!A1 is not "videoId". Sheet structure unexpected!');
    process.exit(1);
  }
  if (songsLongHeader[0] !== 'videoId') {
    console.error('❌ ABORT: SONGS_LONG!A1 is not "videoId". Sheet structure unexpected!');
    process.exit(1);
  }

  console.log('  ✅ Existing headers verified.\n');

  // ─── Check if headers already exist ───────────────────────────────────────
  const artistsM = artistsHeader[12]; // M = index 12
  const artistsN = artistsHeader[13]; // N = index 13
  const songsG   = songsHeader[6];    // G = index 6
  const songsLongG = songsLongHeader[6];

  console.log(`  Artists M1 (current): "${artistsM || '(empty)'}"`);
  console.log(`  Artists N1 (current): "${artistsN || '(empty)'}"`);
  console.log(`  SONGS G1 (current): "${songsG || '(empty)'}"`);
  console.log(`  SONGS_LONG G1 (current): "${songsLongG || '(empty)'}"\n`);

  // ─── STEP 1: Add headers ───────────────────────────────────────────────────
  console.log('Step 1: Adding new column headers...');

  if (artistsM !== 'Type') {
    await safeUpdate('Artists!M1', [['Type']], 'Artists!M1 = "Type"');
  } else {
    console.log('  ⏭️  Artists!M1 already has "Type", skipping.');
  }

  if (artistsN !== 'Detected Artists') {
    await safeUpdate('Artists!N1', [['Detected Artists']], 'Artists!N1 = "Detected Artists"');
  } else {
    console.log('  ⏭️  Artists!N1 already has "Detected Artists", skipping.');
  }

  if (songsG !== 'DetectedArtist') {
    await safeUpdate('SONGS!G1', [['DetectedArtist']], 'SONGS!G1 = "DetectedArtist"');
  } else {
    console.log('  ⏭️  SONGS!G1 already has "DetectedArtist", skipping.');
  }

  if (songsLongG !== 'DetectedArtist') {
    await safeUpdate('SONGS_LONG!G1', [['DetectedArtist']], 'SONGS_LONG!G1 = "DetectedArtist"');
  } else {
    console.log('  ⏭️  SONGS_LONG!G1 already has "DetectedArtist", skipping.');
  }

  console.log('  ✅ Headers done.\n');

  // ─── STEP 2: Initialize Type column in Artists sheet ──────────────────────
  console.log('Step 2: Initializing Type column (M) for all Artists rows...');

  const rAllArtists = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!A2:M', // Read up to M to check if Type already set
  });
  const allRows = rAllArtists.data.values || [];
  console.log(`  Total artist rows: ${allRows.length}`);

  // Build batch update: only set M if it's currently empty
  const updates = [];
  let labelCount = 0;
  let artistCount = 0;
  let skipCount = 0;

  allRows.forEach((row, i) => {
    const rowIndex = i + 2; // 1-based, skip header
    const name = row[0] || '';
    const prodFlag = row[5] || ''; // F column = index 5
    const currentType = row[12] || ''; // M column = index 12

    if (!name) return; // Skip empty rows

    if (currentType) {
      skipCount++;
      return; // Already has a Type value, skip
    }

    const type = prodFlag === 'P' ? 'Label' : 'Artist';
    if (prodFlag === 'P') labelCount++;
    else artistCount++;

    updates.push({ range: `Artists!M${rowIndex}`, values: [[type]] });
  });

  console.log(`  New rows to set: ${updates.length} (${artistCount} Artist, ${labelCount} Label, ${skipCount} already set)`);

  if (updates.length > 0) {
    // Show preview
    const preview = updates.slice(0, 5);
    preview.forEach(u => console.log(`    ${u.range} → ${u.values[0][0]}`));
    if (updates.length > 5) console.log(`    ... and ${updates.length - 5} more`);

    if (!DRY_RUN) {
      // Batch update in chunks of 100 to avoid API limits
      const CHUNK = 100;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            valueInputOption: 'RAW',
            data: chunk,
          },
        });
        console.log(`  Written ${Math.min(i + CHUNK, updates.length)}/${updates.length} rows...`);
        // Brief pause to avoid quota hits
        if (i + CHUNK < updates.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      console.log('  ✅ Type column initialized.');
    } else {
      console.log('  [DRY RUN] Would write the above updates.');
    }
  } else {
    console.log('  ✅ No updates needed (all rows already have Type).');
  }

  console.log('\n=== Setup Complete ===');
  if (DRY_RUN) {
    console.log('\n🔍 This was a DRY RUN. Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
