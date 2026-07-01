import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { supabase } from '@/lib/supabase';

const DUMP_FILE = path.join(process.cwd(), 'dune_dump.json');
const SYNC_PROGRESS_FILE = path.join(process.cwd(), 'supabase_sync_progress.json');

export async function POST(request: Request) {
  try {
    const { batchSize = 5000 } = await request.json();

    // Read Dune Data
    let duneData: any[] = [];
    try {
      const dataStr = await fs.readFile(DUMP_FILE, 'utf-8');
      duneData = JSON.parse(dataStr);
    } catch (e) {
      return NextResponse.json({ error: 'Local dune_dump.json not found. Dump data first.' }, { status: 400 });
    }

    // Read Progress
    let progress = { lastIndexSynced: 0 };
    try {
      const progStr = await fs.readFile(SYNC_PROGRESS_FILE, 'utf-8');
      progress = JSON.parse(progStr);
    } catch (e) {
      // file doesn't exist yet
    }

    const startIndex = progress.lastIndexSynced;
    if (startIndex >= duneData.length) {
      return NextResponse.json({ 
        message: 'Sync complete!', 
        finished: true,
        progress: { current: duneData.length, total: duneData.length }
      });
    }

    const endIndex = Math.min(startIndex + batchSize, duneData.length);
    const batch = duneData.slice(startIndex, endIndex);

    // Map to Supabase Schema
    const recordsToInsert = batch.map((item) => {
      const address = item.token_mint_address || item.mint || item.address || Object.values(item).find(v => typeof v === 'string' && v.length >= 32 && v.length <= 44);
      return {
        token_mint_address: address ? address.replace(/\0/g, '') : null,
        symbol: item.symbol ? item.symbol.replace(/\0/g, '') : null,
        sol_balance: item.sol_balance || 0,
        adjusted_sol_balance: item.adjusted_sol_balance || 0,
        is_scanned: false,
      };
    }).filter(r => r.token_mint_address); // Ensure we have a valid primary key

    if (recordsToInsert.length > 0) {
      const { error } = await supabase
        .from('dune_tokens')
        .upsert(recordsToInsert, { onConflict: 'token_mint_address', ignoreDuplicates: true });

      if (error) {
        console.error('Supabase Insert Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    progress.lastIndexSynced = endIndex;
    await fs.writeFile(SYNC_PROGRESS_FILE, JSON.stringify(progress, null, 2));

    return NextResponse.json({
      success: true,
      syncedThisBatch: batch.length,
      progress: {
        current: endIndex,
        total: duneData.length
      },
      finished: endIndex >= duneData.length
    });

  } catch (error: any) {
    console.error('Error syncing to Supabase:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    let progress = { current: 0, total: 0 };
    try {
       const progStr = await fs.readFile(SYNC_PROGRESS_FILE, 'utf-8');
       const prog = JSON.parse(progStr);
       progress.current = prog.lastIndexSynced;
    } catch(e) {}

    try {
       const dataStr = await fs.readFile(DUMP_FILE, 'utf-8');
       const duneData = JSON.parse(dataStr);
       progress.total = duneData.length;
    } catch(e) {}

    return NextResponse.json({ progress });
  } catch (e) {
    return NextResponse.json({ progress: { current: 0, total: 0 } });
  }
}
