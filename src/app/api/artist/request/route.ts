import { NextResponse } from 'next/server';
import { getBigQueryClient } from '@/lib/bigquery';
import { getSheetData, ensureSheetExists, appendSheetData } from '@/lib/sheets';
import { sendTelegramNotification } from '@/lib/telegram';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('facebook.com') && !url.includes('fb.com')) {
      return NextResponse.json({ error: 'Please submit a valid YouTube or Facebook link.' }, { status: 400 });
    }

    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;
    if (!sheetId) {
       console.error('Missing NEXT_PUBLIC_SHEET_ID for candidate registration.');
       return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    // --- 1. Parse and Resolve YouTube Channel ID ---
    let targetChannelId = '';
    let targetHandle = '';
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

    if (isYoutube) {
      if (url.includes('/channel/')) {
        targetChannelId = url.split('/channel/')[1].split('/')[0].split('?')[0];
      } else if (url.includes('/@')) {
        targetHandle = url.split('/@')[1].split('/')[0].split('?')[0];
      } else if (url.includes('/c/')) {
        targetHandle = url.split('/c/')[1].split('/')[0].split('?')[0];
      }

      // If we only have a handle, attempt to resolve the Channel ID via API
      if (targetHandle && !targetChannelId) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (apiKey) {
            try {
              const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${targetHandle}&key=${apiKey}`);
              const data = await res.json();
              if (data.items && data.items.length > 0) {
                 targetChannelId = data.items[0].id;
              }
            } catch (e) {
              console.error('Failed to resolve YouTube handle to channelId', e);
            }
        }
      }
    }

    // --- 2. Check Existing Database (Google Sheet "Artists") ---
    // The "Artists" sheet is the single source of truth used by the HEAT engine.
    let isExisting = false;
    let duplicateReason = '';

    try {
      const artData = await getSheetData(sheetId, 'Artists!A:E');
      if (artData && artData.length > 1) {
        // Skip header
        for (let i = 1; i < artData.length; i++) {
          const rowUrl = String(artData[i][1] || '').trim();
          const rowChannelId = String(artData[i][2] || '').trim();
          const rowFacebook = String(artData[i][4] || '').trim();

          // Match by raw string
          if (rowUrl && url.includes(rowUrl)) isExisting = true;
          // Match by precise YouTube Channel ID
          if (isYoutube && targetChannelId && rowChannelId === targetChannelId) isExisting = true;
          // Match by precise Facebook (basic substring match is robust enough for FB generally)
          if (!isYoutube && rowFacebook && (url.includes(rowFacebook) || rowFacebook.includes(url))) isExisting = true;

          if (isExisting) {
            duplicateReason = 'Artist is already officially registered.';
            break;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to read Artists sheet. Falling back to Candidate sheet check...', e);
    }

    if (isExisting) {
      return NextResponse.json({ message: duplicateReason, existing: true });
    }

    // --- 3. Check Pending Candidate Sheet ---
    const SHEET_NAME = 'Candidate';
    await ensureSheetExists(sheetId, SHEET_NAME);

    try {
      const existingData = await getSheetData(sheetId, `${SHEET_NAME}!B:B`);
      if (existingData) {
         const urls = existingData.map(row => row[0]);
         if (urls.includes(url) || (targetChannelId && urls.some(u => String(u).includes(targetChannelId))) || (targetHandle && urls.some(u => String(u).includes(targetHandle)))) {
           isExisting = true;
           duplicateReason = 'Artist is already in the pending verification list.';
         }
      }
    } catch (err) {
      console.warn('Candidate sheet might be empty or unavailable.', err);
    }

    if (isExisting) {
      return NextResponse.json({ message: duplicateReason, existing: true });
    }

    // --- 4. Check BigQuery as a final safety net ---
    const bq = getBigQueryClient();
    if (bq && !isExisting) {
      const DATASET_ID = 'heat_ranking';
      const query = `
        SELECT name 
        FROM \`${DATASET_ID}.artists_master\`
        WHERE facebook = @url 
           OR links LIKE CONCAT('%', @url, '%')
           ${targetChannelId ? `OR links LIKE CONCAT('%', @targetChannelId, '%')` : ''}
        LIMIT 1
      `;
      try {
        const [rows] = await bq.query({
          query,
          params: { url, targetChannelId: targetChannelId || '' }
        });
        if (rows && rows.length > 0) {
          isExisting = true;
          duplicateReason = 'Artist is already strictly registered in our BigQuery database.';
        }
      } catch (err) {
        console.error('BigQuery artist check failed, continuing...', err);
      }
    }

    if (isExisting) {
      return NextResponse.json({ message: duplicateReason, existing: true });
    }

    // --- 5. Append to Candidate Sheet ---
    const timestamp = new Date().toISOString();
    try {
       await appendSheetData(sheetId, `${SHEET_NAME}!A:C`, [[timestamp, url, 'Pending']]);
    } catch (err) {
       console.error('Failed to append to Candidate sheet:', err);
       return NextResponse.json({ error: 'Failed to record registration request' }, { status: 500 });
    }

    // --- 6. Send Telegram Notification ---
    const tgMessage = `<b>🆕 New Artist Registration Request</b>\n\nLink: ${url}\n\n<i>Please verify and add to the Artist sheet.</i>`;
    await sendTelegramNotification(tgMessage);

    return NextResponse.json({ message: 'Artist registration submitted successfully.', existing: false });
  } catch (error: any) {
    console.error('Error processing artist registration:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
