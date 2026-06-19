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

// List all tables in the dataset
const [tables] = await bq.dataset('heat_ranking').getTables();
console.log('=== heat_ranking テーブル一覧 ===');
for (const t of tables) {
  console.log('-', t.id);
}

// Check rank_history date range
const [rh] = await bq.query(`
  SELECT MIN(date) as oldest, MAX(date) as newest, COUNT(DISTINCT date) as days
  FROM \`heat_ranking.rank_history\`
`);
console.log('\n=== rank_history ===');
console.log('最古:', rh[0].oldest?.value, '最新:', rh[0].newest?.value, '日数:', rh[0].days);
// Check heat_songs
const [hs] = await bq.query(`
  SELECT MIN(date) as oldest, MAX(date) as newest, COUNT(DISTINCT date) as days
  FROM \`heat_ranking.heat_songs\`
`).catch(() => [[{ oldest: null, newest: null, days: 0 }]]);
console.log('\n=== heat_songs ===');
console.log('最古:', hs[0].oldest?.value || hs[0].oldest, '最新:', hs[0].newest?.value || hs[0].newest, '日数:', hs[0].days);

// Check heat_releases
const [hr] = await bq.query(`SELECT * FROM \`heat_ranking.heat_releases\` LIMIT 3`).catch(() => [[]]);
console.log('\n=== heat_releases サンプル ===');
console.log(hr);
