const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function uploadMigration() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '..', 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const folderId = '1IBq2ofHkPQi8uUwp3LbQpeNxeqDts00k'; // HEAT (Shared Drive folder)
  const filePath = path.join(__dirname, '..', 'migration.zip');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: ${filePath} not found. Please run export_migration.ps1 first.`);
    process.exit(1);
  }

  console.log(`Uploading migration.zip to folder ID: ${folderId}...`);

  try {
    const fileMetadata = {
      name: 'migration.zip',
      parents: [folderId],
    };
    const media = {
      mimeType: 'application/zip',
      body: fs.createReadStream(filePath),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true,
    });

    console.log(`✅ SUCCESS! File ID: ${file.data.id}`);
    console.log('Use this file on your Mac.');
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
    if (err.message.includes('404')) {
      console.log('--- TIPS ---');
      const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-credentials.json')));
      console.log(`Ensure the folder is shared with: ${creds.client_email}`);
    }
  }
}

uploadMigration();
