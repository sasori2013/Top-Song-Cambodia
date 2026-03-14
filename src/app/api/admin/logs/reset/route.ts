import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';

export async function POST(req: Request) {
  try {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID || '1BjPfq34YD3PLgBCsuH4gCQhN5wgnqBCgNcQNAVd4QQ4';
    
    let auth;
    if (process.env.GOOGLE_CREDS) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_CREDS);
        auth = new google.auth.GoogleAuth({
          credentials: creds,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } catch (e) {
        console.error("Failed to parse GOOGLE_CREDS env var:", e);
      }
    }

    if (!auth) {
      auth = new google.auth.GoogleAuth({
        keyFile: path.join(process.cwd(), 'google-credentials.json'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }

    const sheets = google.sheets({ version: 'v4', auth });

    // Clear the DISMISSED_LOGS sheet
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: 'DISMISSED_LOGS!A:Z',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error resetting logs:', error.message || error);
    return NextResponse.json({ error: error.message || 'Failed to reset logs' }, { status: 500 });
  }
}
