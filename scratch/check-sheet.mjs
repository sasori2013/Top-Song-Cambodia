import { getSpreadsheetMetadata } from '../src/lib/sheets.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

async function main() {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;
    const meta = await getSpreadsheetMetadata(sheetId);
    console.log(meta.sheets.map(s => s.properties.title));
}
main().catch(console.error);
