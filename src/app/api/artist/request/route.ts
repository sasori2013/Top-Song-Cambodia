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

    // Attempt to extract some core hostname check
    if (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.includes('facebook.com') && !url.includes('fb.com')) {
      return NextResponse.json({ error: 'Please submit a valid YouTube or Facebook link.' }, { status: 400 });
    }

    const bq = getBigQueryClient();
    let bqExists = false;

    // 1. Check BigQuery
    if (bq) {
      const DATASET_ID = 'heat_ranking';
      const query = `
        SELECT name 
        FROM \`${DATASET_ID}.artists_master\`
        WHERE facebook = @url 
           OR links LIKE CONCAT('%', @url, '%')
        LIMIT 1
      `;
      try {
        const [rows] = await bq.query({
          query,
          params: { url }
        });
        if (rows && rows.length > 0) {
          bqExists = true;
        }
      } catch (err) {
        console.error('BigQuery artist check failed, continuing...', err);
      }
    }

    if (bqExists) {
      return NextResponse.json({ message: 'Artist is already registered in our database.', existing: true });
    }

    // 2. Check Candidate Sheet
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;
    if (!sheetId) {
       console.error('Missing NEXT_PUBLIC_SHEET_ID for candidate registration.');
       return NextResponse.json({ error: 'System configuration error' }, { status: 500 });
    }

    const SHEET_NAME = 'Candidate';
    await ensureSheetExists(sheetId, SHEET_NAME);

    let sheetExists = false;
    try {
      // Check column B which will store the URLs
      const existingData = await getSheetData(sheetId, `${SHEET_NAME}!B:B`);
      if (existingData) {
         // Flatten and check if URL already exists
         const urls = existingData.map(row => row[0]);
         if (urls.includes(url)) {
           sheetExists = true;
         }
      }
    } catch (err) {
      console.warn('Candidate sheet might be empty or unavailable.', err);
    }

    if (sheetExists) {
      return NextResponse.json({ message: 'Artist is already in the pending verification list.', existing: true });
    }

    // 3. Append to Candidate Sheet
    const timestamp = new Date().toISOString();
    try {
       await appendSheetData(sheetId, `${SHEET_NAME}!A:C`, [[timestamp, url, 'Pending']]);
    } catch (err) {
       console.error('Failed to append to Candidate sheet:', err);
       return NextResponse.json({ error: 'Failed to record registration request' }, { status: 500 });
    }

    // 4. Send Telegram Notification
    const tgMessage = `<b>🆕 New Artist Registration Request</b>\n\nLink: ${url}\n\n<i>Please verify and add to the Artist sheet.</i>`;
    await sendTelegramNotification(tgMessage);

    return NextResponse.json({ message: 'Artist registration submitted successfully.', existing: false });
  } catch (error: any) {
    console.error('Error processing artist registration:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
