import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

async function enrichArtists() {
  console.log('--- Artist Metadata Enrichment (Auto-Fill) Started ---');
  
  try {
    // 1. Fetch Artists sheet
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Artists!A2:E',
    });
    const rows = res.data.values || [];
    console.log(`Analyzing ${rows.length} artist rows...`);

    const updates = [];
    const seenIds = new Set();
    let enrichedCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowIndex = i + 2;
      let [name, url, id, subs, fb] = rows[i];
      
      // Duplicate check (if ID is already present in another row)
      if (id && id.trim() !== '' && seenIds.has(id.trim())) {
        console.warn(`  Duplicate ID found in sheet: ${id} at row ${rowIndex}`);
        await sendTelegramNotification(`⚠️ <b>重複アーティスト通知</b>\n行 ${rowIndex}: <b>${name || id}</b> はすでにシート内に存在します（重複ID: ${id}）。シートを整理してください。`);
        duplicateCount++;
        continue;
      }
      if (id && id.trim() !== '') seenIds.add(id.trim());

      // A. If ID is missing but URL/Name is present, try to find the Channel ID
      if (!id && (url || name)) {
        console.log(`  Enriching ID for: ${name || url}`);
        try {
          const query = url ? url : `${name} official channel`;
          const resSearch = await youtube.search.list({
            part: ['snippet'],
            q: query,
            type: ['channel'],
            maxResults: 1
          });
          const foundId = resSearch.data.items?.[0]?.id?.channelId;
          if (foundId) {
            id = foundId;
            updates.push({ range: `Artists!C${rowIndex}`, values: [[id]] });
            enrichedCount++;
            seenIds.add(id.trim()); // Add to seenIds to prevent future duplicates in same run
          }
        } catch (e) {
          console.error(`    Failed to search for ${name}: ${e.message}`);
        }
      }

      // B. If ID is present (or just found), fetch latest Subscriber count
      if (id && (!subs || subs === '0' || subs === '')) {
        console.log(`  Updating Subscribers for ID: ${id} (${name || 'Unknown'})`);
        try {
          const resChan = await youtube.channels.list({
            part: ['statistics', 'snippet'],
            id: [id]
          });
          const channel = resChan.data.items?.[0];
          if (channel) {
            const newSubs = channel.statistics.subscriberCount;
            const channelTitle = channel.snippet.title;
            
            updates.push({ range: `Artists!D${rowIndex}`, values: [[newSubs]] });
            // If name was blank but we found the channel title, fill it too
            if (!name) {
                updates.push({ range: `Artists!A${rowIndex}`, values: [[channelTitle]] });
            }
            enrichedCount++;
          }
        } catch (e) {
          console.error(`    Failed to fetch stats for ${id}: ${e.message}`);
        }
      }
    }

    // 2. Batch Update the sheet
    if (updates.length > 0) {
      console.log(`Applying ${updates.length} cell updates to Artists sheet...`);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates
        }
      });
      console.log('Enrichment complete.');
      if (enrichedCount > 0 || duplicateCount > 0) {
          // Optional: final summary notify
      }
    } else {
      console.log('No rows needed enrichment.');
    }

  } catch (error) {
    console.error('Enrichment process failed:', error.message);
    await sendTelegramNotification(`⚠️ <b>アーティスト自動補完エラー</b>\n<code>${error.message}</code>`);
  }
  
  console.log('--- Artist Metadata Enrichment Completed ---');
}

enrichArtists();
