import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const scriptsDir = path.join(process.cwd(), 'scripts');
    
    if (!fs.existsSync(scriptsDir)) {
      return NextResponse.json({ scripts: [] });
    }

    const files = fs.readdirSync(scriptsDir);
    const scriptFiles = files.filter(file => file.endsWith('.mjs') || file.endsWith('.js') || file.endsWith('.ts'));

    const scriptsData = scriptFiles.map(filename => {
      const filePath = path.join(scriptsDir, filename);
      const stats = fs.statSync(filePath);
      
      return {
        name: filename,
        size: stats.size, // bytes
        lastModified: stats.mtime.toISOString(),
      };
    });

    // Sort by last modified date descending (newest first)
    scriptsData.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return NextResponse.json({ scripts: scriptsData });
  } catch (error: any) {
    console.error('Error scanning scripts directory:', error);
    return NextResponse.json({ error: error.message || 'Failed to scan scripts directory' }, { status: 500 });
  }
}
