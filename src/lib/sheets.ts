import { google } from 'googleapis';
import path from 'path';

export async function getSheetData(spreadsheetId: string, range: string) {
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

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values;
}

export async function getSpreadsheetMetadata(spreadsheetId: string) {
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

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return response.data;
}

export async function appendSheetData(spreadsheetId: string, range: string, values: any[][]) {
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

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  });

  return response.data;
}

export async function ensureSheetExists(spreadsheetId: string, title: string) {
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

  const metadata = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = metadata.data.sheets?.some(s => s.properties?.title === title);

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
              },
            },
          },
        ],
      },
    });
  }
}
