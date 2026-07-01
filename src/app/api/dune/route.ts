import { NextResponse } from 'next/server';
import { DuneClient } from '@duneanalytics/client-sdk';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Dune API Key is required' }, { status: 400 });
    }

    const dune = new DuneClient(apiKey);
    
    // Fetch query results
    // According to the image, the queryId is 7630456
    const query_result = await dune.getLatestResult({ queryId: 7630456 });

    if (!query_result || !query_result.result || !query_result.result.rows) {
      return NextResponse.json({ error: 'Failed to fetch data from Dune or empty result' }, { status: 500 });
    }

    // Save to a local file
    const filePath = path.join(process.cwd(), 'dune_dump.json');
    await fs.writeFile(filePath, JSON.stringify(query_result.result.rows, null, 2));

    return NextResponse.json({ 
      success: true, 
      count: query_result.result.rows.length,
      message: `Successfully dumped ${query_result.result.rows.length} rows to dune_dump.json`
    });

  } catch (error: any) {
    console.error('Error fetching from Dune:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
