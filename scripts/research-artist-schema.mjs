import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const SHEET_ID = process.env.NEXT_PUBLIC_SHEET_ID;
const PROJECT_ID = process.env.GCP_PROJECT_ID;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function research() {
  console.log('--- Researching Artists Data Schema ---');
  
  // 1. Check Sheet Headers
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Artists!1:1',
  });
  console.log('Sheet Headers (Row 1):', res.data.values?.[0]);

  // 2. Check BQ Artists Table Schema
  try {
    const [metadata] = await bq.dataset('heat_ranking').table('artists').getMetadata();
    console.log('BQ Artists Columns:', metadata.schema.fields.map(f => `${f.name} (${f.type})`));
  } catch (err) {
    console.log('BQ artists table might not exist or error:', err.message);
  }
}

research().catch(console.error);
