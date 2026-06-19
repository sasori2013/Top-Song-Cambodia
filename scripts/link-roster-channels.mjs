import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['"]|['"]$/g, '');

const SHEET_ID = getEnv('NEXT_PUBLIC_SHEET_ID');
const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const YOUTUBE_API_KEY = getEnv('YOUTUBE_API_KEY');
const LOCATION = 'us-central1';

if (!SHEET_ID || !PROJECT_ID || !YOUTUBE_API_KEY) {
  console.error('Error: Credentials or configuration missing in environment.');
  process.exit(1);
}

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const jsonStr = (rawJson || '').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const sheetsAuth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

const vertexAuth = new GoogleAuth({
  credentials,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

// Vertex AI Gemini REST API Call
async function verifyChannelWithGemini(artistName, candidates) {
  const client = await vertexAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-001:generateContent`;

  const formattedCandidates = candidates.map((c, i) => `
Candidate ${i}:
- Title: "${c.title}"
- Description: "${c.description || 'No description available.'}"
- Subscribers: ${c.subscribers}
- Custom URL: "${c.customUrl || 'None'}"
- ID: "${c.id}"
`).join('\n');

  const prompt = `
You are an expert in Cambodian pop music. We discovered a new artist name from a music label channel: "${artistName}".
We searched YouTube and found the following channel candidates:

${formattedCandidates}

INSTRUCTIONS:
1. Verify if one of these candidates is the official, personal YouTube channel of the singer/artist "${artistName}".
2. It MUST NOT be a production label's channel itself (e.g. Town Production, Ream, Sunday, Galaxy) or a random fan uploader / non-music channel.
3. Independent Cambodian artists often write their description in Khmer or English, and their channel title contains their name (often with suffixes like "Official", "Music", "Singer", "Producer").
4. If a candidate is highly likely (> 80% confidence) to be the artist's official personal channel, return its index.
5. If none match confidently, return -1 in bestCandidateIndex.

Output ONLY a valid JSON object in this format:
{
  "bestCandidateIndex": 0,
  "confidence": 0.95,
  "reason": "Brief explanation in English why this matches or why none match."
}
`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 250, temperature: 0.1 }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Gemini verification API failed: ${response.status}`);
  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  text = text.replace(/```json|```/g, '').trim();
  
  return JSON.parse(text);
}

// Clean and normalize name for safe lookup
function normalize(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, '').replace(/[-_]/g, '');
}

export async function runLinkRosterChannels() {
  console.log(`\n=== HEAT Active Roster Linker Started (${DRY_RUN ? 'DRY RUN' : 'ACTIVE MODE'}) ===\n`);

  // 1. Get Artists in Label_Roster (B: Target Artist)
  const resRoster = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Label_Roster!A2:C' });
  const rosterRows = resRoster.data.values || [];
  const targetArtists = [...new Set(rosterRows.map(r => (r[1] || '').trim()).filter(Boolean))];
  
  console.log(`Found ${targetArtists.length} performing artists in Label_Roster.`);

  // 2. Get currently registered Artists (A: Name, C: ChannelId)
  const resArtists = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Artists!A2:M' });
  const artistRows = resArtists.data.values || [];
  
  const registeredNames = new Set(artistRows.map(r => normalize(r[0])));
  const registeredIds = new Set(artistRows.map(r => (r[2] || '').trim()).filter(Boolean));

  console.log(`Currently tracking ${registeredIds.size} channels in Artists sheet.`);

  // 3. Filter roster artists who are not yet registered
  const unlinkedArtists = targetArtists.filter(artist => {
    return !registeredNames.has(normalize(artist));
  });

  console.log(`Detected ${unlinkedArtists.length} artists in roster that need personal channel resolution.`);

  if (unlinkedArtists.length === 0) {
    console.log('All roster artists are already tracked. Exiting.');
    return;
  }

  let newlyLinkedCount = 0;

  // 4. Resolve each unlinked artist
  for (const artist of unlinkedArtists) {
    console.log(`\nResolving channel for artist: "${artist}"...`);
    try {
      // 4.1 Search YouTube for candidates
      const searchRes = await youtube.search.list({
        part: ['snippet'],
        q: `${artist} Official Channel`,
        type: ['channel'],
        maxResults: 3
      });

      const searchItems = searchRes.data.items || [];
      if (searchItems.length === 0) {
        console.log(`  No YouTube search results for "${artist}". Skipping.`);
        continue;
      }

      const channelIds = searchItems.map(it => it.id.channelId);

      // 4.2 Fetch channel details & statistics
      const chanRes = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: channelIds
      });

      const candidates = (chanRes.data.items || []).map(ch => ({
        id: ch.id,
        title: ch.snippet.title,
        description: ch.snippet.description,
        customUrl: ch.snippet.customUrl,
        subscribers: parseInt(ch.statistics.subscriberCount) || 0
      }));

      if (candidates.length === 0) {
        console.log(`  Failed to retrieve statistics for candidates. Skipping.`);
        continue;
      }

      // 4.3 Verify with Gemini
      console.log(`  Found ${candidates.length} candidates. Querying Gemini verification...`);
      const verification = await verifyChannelWithGemini(artist, candidates);
      
      const bestIdx = verification.bestCandidateIndex;
      const confidence = verification.confidence;
      const reason = verification.reason;

      if (bestIdx === -1 || bestIdx == null || bestIdx >= candidates.length || confidence < 0.85) {
        console.log(`  ❌ Resolution rejected by AI. Confidence: ${(confidence * 100).toFixed(0)}%. Reason: ${reason}`);
        continue;
      }

      const chosen = candidates[bestIdx];
      console.log(`  ✅ Match Confirmed! Title: "${chosen.title}" | ID: ${chosen.id} | Subs: ${chosen.subscribers} | Confidence: ${(confidence * 100).toFixed(0)}%`);

      // Avoid registering duplicate channel ID under different name
      if (registeredIds.has(chosen.id)) {
        console.warn(`  Channel ${chosen.id} is already tracked under a different name. Skipping addition.`);
        continue;
      }

      newlyLinkedCount++;

      // 4.4 Append to Sheet if not in dry-run
      const channelUrl = `https://www.youtube.com/channel/${chosen.id}`;
      // Artists Sheet Schema: [name, url, channelId, subs, facebook, prodType, lastSync, ..., M: type]
      // Columns A-M (13 elements). Column M (index 12) is 'Artist'.
      const newRow = [
        artist,                      // A: Name
        channelUrl,                  // B: URL
        chosen.id,                   // C: Channel ID
        chosen.subscribers,          // D: Subscribers
        '',                          // E: Facebook URL
        '',                          // F: Production Tag
        '',                          // G: lastSync (empty so daily update picks it up)
        '', '', '', '', '',          // H-L: empty
        'Artist'                     // M: Type (Column 13)
      ];

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would write new row to Artists: ${JSON.stringify(newRow)}`);
      } else {
        console.log(`  Writing to Google Sheets Artists sheet...`);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Artists!A:M',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [newRow] }
        });

        // Track immediately so we don't duplicate within same execution
        registeredIds.add(chosen.id);

        // 4.5 Telegram Notification
        const telegramMsg = `
✨ <b>新所属アーティスト公式チャンネル解決</b>

👤 <b>アーティスト</b>: <b>${artist}</b>
📊 <b>チャンネル登録者数</b>: ${chosen.subscribers.toLocaleString()}人
🔗 <b>YouTube</b>: <a href="${channelUrl}">${chosen.title}</a>
📝 <b>判定スコア</b>: 信頼度 <b>${(confidence * 100).toFixed(0)}%</b>
💬 <b>AI選出理由</b>: ${reason}
`;
        await sendTelegramNotification(telegramMsg);
        console.log(`  Notification sent to Telegram!`);
      }

      // Safe delay between operations
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`  Error resolving artist "${artist}":`, err.message);
    }
  }

  console.log(`\n=== HEAT Active Roster Linker Completed (Successfully resolved: ${newlyLinkedCount}) ===\n`);
}

// Automatically execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLinkRosterChannels().catch(console.error);
}
