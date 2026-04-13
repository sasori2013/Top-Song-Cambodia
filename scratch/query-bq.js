const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery();
async function run() {
  const [rows] = await bq.query("SELECT * FROM \`heat_ranking.artists_master\` LIMIT 2");
  console.log(JSON.stringify(rows, null, 2));
}
run();
