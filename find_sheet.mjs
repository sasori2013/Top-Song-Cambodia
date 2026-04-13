import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

async function find() {
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name)',
  });
  console.log(res.data.files);
}
find().catch(console.error);
