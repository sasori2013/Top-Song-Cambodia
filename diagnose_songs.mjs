import { readFileSync } from 'fs';
import { google } from 'googleapis';

const env = readFileSync('.env.local', 'utf8');
const match = env.match(/GOOGLE_SERVICE_ACCOUNT_JSON='([\s\S]+?)'{1,2}\n/);
const rawJson = match[1].replace(/'$/, '');
const creds = JSON.parse(rawJson);
creds.private_key = creds.private_key.replace(/\\n/g, '\n');

const SHEET_ID = env.match(/NEXT_PUBLIC_SHEET_ID=(.+)/)?.[1]?.trim();
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

async function get(range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

// SONGS sheet count
const songs = await get('SONGS!A2:A');
console.log(`SONGS sheet: ${songs.filter(r => r[0]).length} 行`);

// SONGS_LONG sheet count
const songsLong = await get('SONGS_LONG!A2:A');
console.log(`SONGS_LONG sheet: ${songsLong.filter(r => r[0]).length} 行`);

// NG_Keywords sheet
const ngKw = await get('NG_Keywords!A2:A');
const keywords = ngKw.map(r => r[0]).filter(Boolean);
console.log(`\nNG_Keywords: ${keywords.length}件`);
if (keywords.length > 0) {
  console.log('  キーワード一覧:');
  keywords.forEach(kw => console.log(`    "${kw}"`));
}

// Count matches in SONGS
const songsWithTitle = await get('SONGS!A2:C');
const ngMatches = songsWithTitle.filter(row => {
  const title = (row[2] || '').toLowerCase();
  return keywords.some(kw => title.includes(kw.toLowerCase()));
});
console.log(`\n現在のSONGSでNGに一致する曲: ${ngMatches.length}件`);
ngMatches.slice(0, 10).forEach(r => console.log(`  "${r[2]}" (${r[1]})`));
