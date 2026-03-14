const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

async function saveReport() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  console.log('--- Google Drive Report Service ---');
  
  const reportContent = `業務日報 - 2026/03/12
================================

【業務内容】
Facebook自動投稿不具合の調査・修正、および本日の投稿リカバリ

【プロジェクト】
HEAT (Top-Song-Cambodia)

【対応詳細】
1. Facebook自動投稿失敗の調査と根本対策
   - 原因：Google Apps Scriptの実行制限時間（6分）への到達。ランキング生成とAI分析で約4分弱を費やしており、その後の4枚の画像生成・FBアップロードを完遂する時間が不足していた。
   - 対策：ランキング生成（20:00）とFacebook投稿（20:30）の実行トリガーを分離。それぞれに独立した6分間の実行枠を確保することで、タイムアウトを根本的に回避。
   - 改善：投稿プロセスの各ステップに詳細なログ出力を追加し、進捗の可視化を強化。

2. 本日分ランキングの投稿リカバリ
   - GAS側で止まっていた本日（3/12）のランキング投稿を手動スクリプトで実行。
   - 画像4枚（1位個別 + 2-10位マルチ）のアップロード、本文投稿、およびトップコメントの追加が正常に完了したことを確認。

3. GASトリガーの刷新
   - refreshAllTriggers を通じて、新しい分離スケジュール（20:00・20:30）が適用される状態に整備。

【教訓】
- 重い処理（AI分析）と外部I/O（画像アップロード）の連鎖はGASの制限に当たりやすいため、設計段階で「疎結合（分離）」を意識することが重要。
- 詳細なステップログを残すことで、制限時間内のどのフェーズでボトルネックが発生しているかの特定が容易になる。
`;

  try {
    let heatFolderId = await findFolder(drive, "HEAT");
    if (!heatFolderId) {
        console.error('❌ ERROR: "HEAT" folder not found.');
        return;
    }

    let dailyReportFolderId = await findFolder(drive, "日報", heatFolderId);
    if (!dailyReportFolderId) {
        const res = await drive.files.create({
            resource: {
                name: '日報',
                mimeType: 'application/vnd.google-apps.folder',
                parents: [heatFolderId]
            },
            fields: 'id',
            supportsAllDrives: true,
        });
        dailyReportFolderId = res.data.id;
    }

    const fileName = `日報_20260312_Facebook投稿修正.txt`;
    console.log(`Uploading file: ${fileName}...`);
    const fileMetadata = {
      name: fileName,
      parents: [dailyReportFolderId],
    };
    const media = {
      mimeType: 'text/plain',
      body: reportContent,
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
      supportsAllDrives: true,
    });

    console.log('🎉 SUCCESS! File created/uploaded.');
    console.log('File Name:', file.data.name);

  } catch (err) {
    console.error('Unexpected error:', err.message);
  }
}

async function findFolder(drive, name, parentId = null) {
  let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  try {
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files.length > 0 ? res.data.files[0].id : null;
  } catch (e) {
    return null;
  }
}

saveReport();
