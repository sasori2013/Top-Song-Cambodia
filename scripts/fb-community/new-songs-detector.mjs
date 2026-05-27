import { BigQuery } from '@google-cloud/bigquery';

function createBQ() {
  const getEnv = k => (process.env[k] || '').trim().replace(/^['"]|['"]$/g, '');
  const credentials = JSON.parse(getEnv('GOOGLE_SERVICE_ACCOUNT_JSON'));
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  return new BigQuery({ projectId: getEnv('GCP_PROJECT_ID'), credentials });
}

/**
 * Returns yesterday's new songs (by YouTube publishedAt) that have a Facebook page on record.
 * Using yesterday ensures the FB post exists and has accumulated initial engagement.
 * Source: songs_master (publishedAt = yesterday) joined to artists_master (facebook field).
 */
export async function detectNewSongs() {
  const bq = createBQ();

  const query = `
    SELECT
      s.videoId       AS video_id,
      s.title,
      s.artist,
      s.cleanTitle    AS clean_title,
      a.channelId     AS artist_id,
      a.facebook      AS fb_page_url,
      hs.release_id,
      r.album_name
    FROM \`heat_ranking.songs_master\` s
    JOIN \`heat_ranking.artists_master\` a
      ON LOWER(TRIM(a.name)) = LOWER(TRIM(s.artist))
    LEFT JOIN \`heat_ranking.heat_songs\` hs
      ON hs.youtube_video_id = s.videoId
    LEFT JOIN \`heat_ranking.heat_releases\` r
      ON r.release_id = hs.release_id
    WHERE DATE(s.publishedAt, 'Asia/Phnom_Penh') = DATE_SUB(CURRENT_DATE('Asia/Phnom_Penh'), INTERVAL 1 DAY)
      AND a.facebook IS NOT NULL
      AND TRIM(a.facebook) != ''
  `;

  const [rows] = await bq.query({ query });
  console.log(`[Detector] New songs with FB pages today: ${rows.length}`);
  return rows;
}
