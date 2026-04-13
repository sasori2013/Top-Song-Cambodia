import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function saveReport() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
  const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  console.log('--- Google Drive Report Service (Shared Drive Enabled) ---');
  
  const reportContent = `業務日報 - 2026/04/11
================================

【業務内容】
Facebook自動投稿不具合の調査・修正、および未投稿分のリカバリ対応

【プロジェクト】
HEAT (Top-Song-Cambodia)

【対応詳細】
1. Facebook自動投稿失敗の調査と根本対策
   - 原因調査：日次パイプライン（daily-pipeline.yml）において、バックグラウンドの「ベクトル化処理（15,000曲のメタデータエンリッチメントに伴う大量処理）」が先行実行されており、Vertex AIのレート制限（429 Too Many Requests）に頻繁に抵触。5秒間の待機ループが繰り返された結果、後続の「Facebook投稿処理」がタイムアウトなどでブロックされていた。
   - 対策実施：ワークフローの順序を修正し、ランキング生成後「即座にFacebook投稿」を完了させてから、「バックグラウンドでのベクトル化処理」を行うように優先順位を入れ替えた。
   - 改善：ベクトル化スクリプト（vectorize-songs-node.mjs）に、指数的バックオフ（5s, 10s, 20s）と最大リトライ回数（3回）を導入し、無限ループによるパイプラインのフリーズを防止。

2. 昨日の未投稿分の安全なリカバリ
   - YouTube APIのクオータ（制限枠）を消費しないよう、パイプライン全体を再実行するのではなく、ローカル環境にて一時的にFacebookアクセストークンを設定し、投稿スクリプトのみ（post-fb-node.mjs）を単独実行。昨日のランキングの投稿を正常に完了させた。

【教訓】
- 大量のバックグラウンドバッチ処理（AI分析やベクトル化など）は、ユーザーへの即時対応が必要な処理（SNS投稿など）の後に配置することで、遅延のリスクを下げる設計の重要性を再認識。
- 外部APIへのリクエスト設計において、上限のないリトライ待機はシステムの致命的な停止を招くため、必ず回数制限とフェイルセーフな例外処理を実装する。
`;

  try {
    let heatFolderId = await findFolder(drive, "HEAT日報");
    if (!heatFolderId) {
        console.error('❌ ERROR: "HEAT日報" folder not found.');
        return;
    }
    console.log(`✅ Found "HEAT日報" folder: ${heatFolderId}`);

    let dailyReportFolderId = heatFolderId; // Assume this folder itself is for reports or it has subfolders. But usually the report is just placed in it if not specified.
    // Let's keep the logic simple, if they renamed the report folder to "HEAT日報", we save here.
    // Or if they renamed the root, we still save in it? Actually let's just save in HEAT日報.
    console.log(`✅ Using "HEAT日報" folder: \${dailyReportFolderId}`);

    const fileName = `日報_20260411_FB投稿ブロック修正.txt`;
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
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
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
