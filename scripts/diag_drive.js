const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function listFiles() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '..', 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  console.log('Listing files visible to service account...');

  try {
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name, parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const files = res.data.files;
    if (files.length) {
      console.log('Files:');
      files.map((file) => {
        console.log(`${file.name} (${file.id}) - Parents: ${file.parents ? file.parents.join(', ') : 'None'}`);
      });
    } else {
      console.log('No files found.');
    }
  } catch (err) {
    console.error('The API returned an error: ' + err);
  }
}

listFiles();
