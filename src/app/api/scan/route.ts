import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { MINT_SIZE, MintLayout } from '@solana/spl-token';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { rpcUrl, batchSize = 100 } = await request.json();

    if (!rpcUrl) {
      return NextResponse.json({ error: 'Solana RPC URL is required' }, { status: 400 });
    }

    // Fetch unscanned tokens from Supabase
    const { data: batch, error: fetchError } = await supabase
      .from('dune_tokens')
      .select('*')
      .eq('is_scanned', false)
      .limit(batchSize);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!batch || batch.length === 0) {
      return NextResponse.json({ 
        message: 'Scan complete! No more unscanned tokens.', 
        finished: true 
      });
    }

    const connection = new Connection(rpcUrl);

    // Extract valid public keys
    const publicKeys: PublicKey[] = [];
    const validBatchItems = [];

    for (const item of batch) {
      const mintAddressStr = item.token_mint_address;
      if (mintAddressStr) {
        try {
          publicKeys.push(new PublicKey(mintAddressStr));
          validBatchItems.push(item);
        } catch (e) {
          // Invalid public key - mark as scanned but no active authority
          await supabase
            .from('dune_tokens')
            .update({ is_scanned: true, has_active_authority: false })
            .eq('token_mint_address', mintAddressStr);
        }
      }
    }

    let foundThisBatch = 0;

    // Fetch multiple accounts
    if (publicKeys.length > 0) {
      const accountsInfo = await connection.getMultipleAccountsInfo(publicKeys);

      const updates = [];

      for (let i = 0; i < accountsInfo.length; i++) {
        const info = accountsInfo[i];
        const item = validBatchItems[i];
        let hasAuthority = false;
        let authorityAddress = null;

        if (info && info.data && info.data.length === MINT_SIZE) {
          const mintInfo = MintLayout.decode(info.data);
          
          if (mintInfo.mintAuthorityOption === 1) {
            hasAuthority = true;
            authorityAddress = mintInfo.mintAuthority.toBase58();
            foundThisBatch++;
          }
        }

        // Prepare update for Supabase
        updates.push({
          token_mint_address: item.token_mint_address,
          symbol: item.symbol,
          sol_balance: item.sol_balance,
          adjusted_sol_balance: item.adjusted_sol_balance,
          is_scanned: true,
          mint_authority: authorityAddress,
          has_active_authority: hasAuthority,
        });
      }

      // Bulk upsert updates back to Supabase
      if (updates.length > 0) {
        const { error: updateError } = await supabase
          .from('dune_tokens')
          .upsert(updates, { onConflict: 'token_mint_address' });

        if (updateError) {
          console.error('Failed to update Supabase:', updateError);
        }
      }
    }

    // Get total progress stats
    const { count: scannedCount } = await supabase
      .from('dune_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('is_scanned', true);

    const { count: totalCount } = await supabase
      .from('dune_tokens')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      scannedThisBatch: batch.length,
      foundThisBatch,
      progress: {
        current: scannedCount || 0,
        total: totalCount || 0
      },
      finished: false
    });

  } catch (error: any) {
    console.error('Error scanning tokens:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// Fetch the currently verified tokens for the UI
export async function GET() {
  try {
    const { data: tokens, error } = await supabase
      .from('dune_tokens')
      .select('*')
      .eq('has_active_authority', true)
      .limit(500); // Limit to 500 for UI performance

    const { count: scannedCount } = await supabase
      .from('dune_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('is_scanned', true);

    const { count: totalCount } = await supabase
      .from('dune_tokens')
      .select('*', { count: 'exact', head: true });

    if (error) {
       return NextResponse.json({ tokens: [], progress: { current: 0, total: 0 } });
    }

    return NextResponse.json({ 
      tokens: tokens || [], 
      progress: { current: scannedCount || 0, total: totalCount || 0 } 
    });
  } catch (e) {
    return NextResponse.json({ tokens: [], progress: { current: 0, total: 0 } });
  }
}
