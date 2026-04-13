import { getSheetData, getSpreadsheetMetadata } from '../src/lib/sheets.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

async function main() {
    const sheetId = process.env.NEXT_PUBLIC_SHEET_ID;
    const meta = await getSpreadsheetMetadata(sheetId);
    const names = meta.sheets.map(s => s.properties.title);
    console.log("Sheets:", names);
}
main().catch(console.error);
