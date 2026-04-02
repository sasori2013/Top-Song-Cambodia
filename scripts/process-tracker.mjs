import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DATASET_ID = 'heat_ranking';
const TABLE_ID = 'process_status';

// Credentials Setup
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}';
const credentials = JSON.parse(rawJson.trim().replace(/^['"]|['"]$/g, ''));
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const bq = new BigQuery({
  projectId: PROJECT_ID,
  credentials,
});

/**
 * Updates the process status in BigQuery.
 * @param {string} name - Human readable name of the process
 * @param {number} progress - Current items processed
 * @param {number} total - Total items to process
 * @param {string} status - 'running', 'completed', 'error'
 */
export async function updateProcessStatus(name, progress, total, status = 'running') {
  const id = 'main_process'; // We keep one main record for the dashboard
  const timestamp = new Date().toISOString();

  // Optimized for "Upsert" using MERGE
  const query = `
    MERGE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` T
    USING (SELECT @id AS id, @name AS name, @progress AS progress, @total AS total, @status AS status) S
    ON T.id = S.id
    WHEN MATCHED THEN
      UPDATE SET name = S.name, progress = S.progress, total = S.total, status = S.status, last_updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (id, name, progress, total, status, last_updated_at)
      VALUES (S.id, S.name, S.progress, S.total, S.status, CURRENT_TIMESTAMP())
  `;

  const options = {
    query,
    params: {
      id,
      name,
      progress,
      total,
      status
    }
  };

  try {
    await bq.query(options);
    // console.log(`[Status Update] ${progress}/${total} (${status})`);
  } catch (err) {
    console.error('Failed to update process status in BigQuery:', err);
  }
}

/**
 * Clears the process status.
 */
export async function clearProcessStatus() {
  const query = `UPDATE \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\` SET status = 'idle' WHERE id = 'main_process'`;
  try {
    await bq.query({ query });
  } catch (err) {
    console.error('Failed to clear process status:', err);
  }
}
