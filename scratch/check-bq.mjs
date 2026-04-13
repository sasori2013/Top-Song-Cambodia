import { getBigQueryClient } from '../src/lib/bigquery.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

async function main() {
    const bq = getBigQueryClient();
    const [rows] = await bq.query(`SELECT name, links, artistInfo FROM heat_ranking.artists_master LIMIT 5`);
    console.log(rows);
    
    // Check Candidate sheet as well
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;
    console.log("Sheet ID: ", sheetId);
}
main().catch(console.error);
