import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendTelegramNotification } from './telegram-node.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env.local') });

const getEnv = (key) => (process.env[key] || '').trim().replace(/^['\"]|['\"]$/g, '');

const PROJECT_ID = getEnv('GCP_PROJECT_ID');
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'process_status';

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const jsonStr = (rawJson || '').trim().replace(/^['\"]|['\"]$/g, '');
const credentials = JSON.parse(jsonStr);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

async function runMonitor() {
  console.log('--- Pipeline Process Monitoring Started ---');
  
  try {
    const query = `
      SELECT id, name, status, 
        TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_updated_at, MINUTE) as elapsed_min
      FROM \`${DATASET_ID}.${TABLE_ID}\`
      WHERE status = 'running' 
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_updated_at, MINUTE) > 60
      ORDER BY last_updated_at DESC
    `;
    
    const [rows] = await bq.query(query);
    console.log(`Found ${rows.length} potentially stuck processes.`);

    for (const row of rows) {
      const msg = `🚨 <b>プロセス滞留警告 (Monitor)</b>\n` +
                  `処理名: <b>${row.name}</b> (ID: ${row.id})\n` +
                  `経過時間: <b>${row.elapsed_min} 分</b>\n\n` +
                  `1時間以上「実行中」のまま更新がありません。無限ループ、ネットワークエラー、またはプロセスの異常終了による「ステータス更新漏れ」の可能性があります。`;
      
      console.warn(`Stuck process detected: ${row.name}`);
      await sendTelegramNotification(msg);
    }
  } catch (error) {
    console.error('Monitor run failed:', error.message);
  }
  
  console.log('--- Pipeline Process Monitoring Completed ---');
}

runMonitor();
