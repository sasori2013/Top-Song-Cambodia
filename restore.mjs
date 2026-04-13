import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env.local') });

function parseCreds() {
    let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
    raw = raw.trim().replace(/^['"]|['"]$/g, '');
    const c = JSON.parse(raw);
    if(c.private_key) c.private_key = c.private_key.replace(/\\n/g, '\n');
    return c;
}

const bq = new BigQuery({ 
  projectId: process.env.GCP_PROJECT_ID, 
  credentials: parseCreds() 
});

async function restore() {
  console.log('Restoring from Time Travel...');
  await bq.query(`
    CREATE OR REPLACE TABLE \`heat_ranking.songs_master\` AS
    SELECT * FROM \`heat_ranking.songs_master\`
    FOR SYSTEM_TIME AS OF TIMESTAMP('2026-04-10 02:50:00 UTC')
  `);
  console.log('Restored!');
  
  const [rows] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\` WHERE category = 'Other'`);
  console.log('Category=Other count now:', rows[0].c);
  const [rows2] = await bq.query(`SELECT COUNT(*) as c FROM \`heat_ranking.songs_master\` WHERE eventTag = 'None'`);
  console.log('EventTag=None count now:', rows2[0].c);
}
restore().catch(console.error);
