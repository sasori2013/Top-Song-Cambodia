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

async function addArtist(input) {
  if (!input) {
    console.error('使用法: node scripts/add-artist.mjs <YouTube URL または Artist Name>');
    return;
  }

  console.log(`--- Artist ID Resolution for: ${input} ---`);

  try {
    // 1. Resolve Channel ID from URL or Name
    let channelId = '';
    
    if (input.includes('youtube.com/channel/')) {
        channelId = input.split('channel/')[1].split('/')[0].split('?')[0];
    } else {
        // Try to search/resolve handle or name
        const resSearch = await youtube.search.list({
            part: ['snippet'],
            q: input,
            type: ['channel'],
            maxResults: 1
        });
        channelId = resSearch.data.items?.[0]?.id?.channelId;
    }

    if (!channelId) {
        console.error('❌ チャンネルが見つかりませんでした。');
        return;
    }

    // 2. Check for Duplicate in SHEET (Col C: ID)
    const resSheet = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Artists!C2:C',
    });
    const existingIds = (resSheet.data.values || []).flat().map(id => id.trim());
    
    if (existingIds.includes(channelId)) {
        const msg = `⚠️ すでに登録されています: (Channel ID: ${channelId})`;
        console.warn(msg);
        // await sendTelegramNotification(`Duplicate Try: ${input} is already in the list.`);
        return;
    }

    // 3. Fetch Metadata and Fill
    console.log(`Finding metadata for ID: ${channelId}...`);
    const resChan = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId]
    });
    const channel = resChan.data.items?.[0];
    
    if (!channel) {
        console.error('❌ IDは特定できましたが、チャンネル詳細の取得に失敗しました。');
        return;
    }

    const title = channel.snippet.title;
    const subs = channel.statistics.subscriberCount;
    const url = `https://www.youtube.com/channel/${channelId}`;

    // 4. Append to Sheet
    const newRow = [title, url, channelId, subs, ''];
    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Artists!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] }
    });

    const successMsg = `✅ <b>新規登録完了</b>\nアーティスト: <b>${title}</b>\n登録数: ${subs}\nURL: ${url}`;
    console.log(`✅ 登録完了: ${title}`);
    await sendTelegramNotification(successMsg);

  } catch (err) {
    console.error('Error during artist addition:', err.message);
  }
}

const inputParam = process.argv[2];
addArtist(inputParam);
