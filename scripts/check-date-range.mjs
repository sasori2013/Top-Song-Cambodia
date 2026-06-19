import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const PROJECT_ID = env.GCP_PROJECT_ID;
const rawJson = (env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}').trim().replace(/^['"]|['"]$/g, '');
const credentials = JSON.parse(rawJson);
if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const bq = new BigQuery({ projectId: PROJECT_ID, credentials });

const [rows] = await bq.query(`
  SELECT 
    MIN(date) as oldest,
    MAX(date) as newest,
    COUNT(DISTINCT date) as total_days
  FROM \`heat_ranking.snapshots\`
`);
const r = rows[0];
console.log('最古:', r.oldest.value);
console.log('最新:', r.newest.value);
console.log('総日数:', r.total_days);
