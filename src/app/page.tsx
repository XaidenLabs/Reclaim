"use client";

import { useState, useEffect } from "react";
import { Search, Download, ShieldCheck, Database, Loader2, Play, ExternalLink, Copy, Check } from "lucide-react";

export default function Home() {
  const [duneApiKey, setDuneApiKey] = useState("");
  const [rpcUrl, setRpcUrl] = useState("https://api.mainnet-beta.solana.com");
  const [loadingDump, setLoadingDump] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingScan, setLoadingScan] = useState(false);
  const [status, setStatus] = useState({ message: "", type: "" });
  const [tokens, setTokens] = useState<any[]>([]);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    fetchTokens();
    fetchSyncProgress();
  }, []);

  const fetchTokens = async () => {
    try {
      const res = await fetch("/api/scan");
      const data = await res.json();
      if (data.tokens) setTokens(data.tokens);
      if (data.progress) setScanProgress(data.progress);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSyncProgress = async () => {
    try {
      const res = await fetch("/api/supabase/sync");
      const data = await res.json();
      if (data.progress) setSyncProgress(data.progress);
    } catch (e) {
      console.error(e);
    }
  }

  const handleDumpAndSync = async () => {
    if (!duneApiKey && syncProgress.total === 0) {
      setStatus({ message: "Please enter your Dune API Key", type: "error" });
      return;
    }
    
    // Step 1: Dump Local if not dumped yet
    if (syncProgress.total === 0 && syncProgress.current === 0) {
      setLoadingDump(true);
      setStatus({ message: "Fetching data from Dune... This uses your credits once.", type: "info" });
      try {
        const res = await fetch("/api/dune", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: duneApiKey }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus({ message: data.error || "Failed to dump data", type: "error" });
          setLoadingDump(false);
          return;
        }
      } catch (e) {
        setStatus({ message: "Network error occurred while fetching Dune data", type: "error" });
        setLoadingDump(false);
        return;
      }
      setLoadingDump(false);
    }

    // Step 2: Sync to Supabase
    setLoadingSync(true);
    setStatus({ message: "Syncing data to Supabase database... Please leave this page open.", type: "info" });
    
    let isFinished = false;
    let syncErrors = 0;

    while (!isFinished && syncErrors < 3) {
      try {
        const res = await fetch("/api/supabase/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 5000 }),
        });
        const data = await res.json();
        
        if (res.ok) {
          if (data.finished) {
            isFinished = true;
            setStatus({ message: "Successfully fetched from Dune and synced to DB!", type: "success" });
            setSyncProgress(data.progress);
          } else {
            setSyncProgress(data.progress);
            setStatus({ message: `Syncing to DB: ${data.progress.current} / ${data.progress.total} tokens...`, type: "info" });
          }
          await fetchTokens(); // update total count in scanner
        } else {
          syncErrors++;
          setStatus({ message: `Error: ${data.error}. Retrying... (${syncErrors}/3)`, type: "error" });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e) {
        syncErrors++;
        setStatus({ message: `Network error syncing. Retrying... (${syncErrors}/3)`, type: "error" });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    setLoadingSync(false);
  };

  const handleScanTokens = async () => {
    if (!rpcUrl) {
      setStatus({ message: "Please enter a Solana RPC URL", type: "error" });
      return;
    }
    setLoadingScan(true);
    setStatus({ message: "Scanning Solana accounts from Supabase... This can take a while.", type: "info" });
    
    let isFinished = false;
    let scanErrors = 0;

    while (!isFinished && scanErrors < 3) {
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rpcUrl, batchSize: 50 }),
        });
        const data = await res.json();
        
        if (res.ok) {
          if (data.finished) {
            isFinished = true;
            setStatus({ message: `Scan complete! All tokens in DB have been checked.`, type: "success" });
          } else {
            setScanProgress(data.progress);
            setStatus({ message: `Scanned ${data.progress.current} / ${data.progress.total} tokens...`, type: "info" });
          }
          await fetchTokens(); // Refresh UI
        } else {
          scanErrors++;
          setStatus({ message: `Error: ${data.error}. Retrying... (${scanErrors}/3)`, type: "error" });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e) {
        scanErrors++;
        setStatus({ message: `Network error scanning. Retrying... (${scanErrors}/3)`, type: "error" });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    if (scanErrors >= 3) {
      setStatus({ message: "Scan aborted due to too many errors.", type: "error" });
    }
    setLoadingScan(false);
  };

  return (
    <main className="min-h-screen bg-[#0A0A0B] text-slate-200 font-sans pb-20">
      {/* Header */}
      <div className="w-full bg-[#111114] border-b border-white/5 py-6 px-8 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
            <Search className="text-indigo-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Recoverable SOL Finder</h1>
            <p className="text-xs text-slate-400 font-medium">SIMD-0266 Active Authority Scanner</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-1 space-y-6">
          
          <div className="bg-[#111114] border border-white/5 rounded-2xl p-6 shadow-lg shadow-black/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              1. Dump Dune Data
            </h2>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Fetch data from Dune Analytics and sync to your Supabase database.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Dune API Key</label>
                <input 
                  type="password" 
                  value={duneApiKey}
                  onChange={e => setDuneApiKey(e.target.value)}
                  className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white placeholder-slate-600"
                  placeholder="Enter your Dune API Key"
                />
              </div>
              <button 
                onClick={handleDumpAndSync}
                disabled={loadingDump || loadingSync || loadingScan || (syncProgress.total > 0 && syncProgress.current === syncProgress.total)}
                className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
              >
                {loadingDump || loadingSync ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {syncProgress.total > 0 && syncProgress.current < syncProgress.total ? "Resume Syncing to DB" : (syncProgress.total > 0 ? "Synced to DB" : "Dump Data & Sync")}
              </button>
              
              {syncProgress.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>DB Sync Progress</span>
                    <span>{syncProgress.current} / {syncProgress.total}</span>
                  </div>
                  <div className="w-full bg-[#1A1A1E] rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#111114] border border-white/5 rounded-2xl p-6 shadow-lg shadow-black/20">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              2. Scan Authorities
            </h2>
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Iterate through the synced data to verify which tokens have an active Mint Authority.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Solana RPC URL</label>
                <input 
                  type="text" 
                  value={rpcUrl}
                  onChange={e => setRpcUrl(e.target.value)}
                  className="w-full bg-[#1A1A1E] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-white placeholder-slate-600"
                  placeholder="https://api.mainnet-beta.solana.com"
                />
              </div>
              <button 
                onClick={handleScanTokens}
                disabled={loadingScan || loadingSync || loadingDump || scanProgress.total === 0}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                {loadingScan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {scanProgress.current > 0 && scanProgress.current < scanProgress.total ? "Resume Scan" : "Start Authority Scan"}
              </button>

              {scanProgress.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Scan Progress</span>
                    <span>{scanProgress.current} / {scanProgress.total}</span>
                  </div>
                  <div className="w-full bg-[#1A1A1E] rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {status.message && (
            <div className={`p-4 rounded-xl border ${
              status.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
              status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              <p className="text-sm font-medium">{status.message}</p>
            </div>
          )}

        </div>

        {/* Right Column: Results Table */}
        <div className="lg:col-span-2">
          <div className="bg-[#111114] border border-white/5 rounded-2xl shadow-lg shadow-black/20 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Verified Recoverable Tokens
                <span className="bg-indigo-500/20 text-indigo-300 text-xs py-1 px-2.5 rounded-full font-bold">
                  {tokens.length} Found
                </span>
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto p-0 custom-scrollbar">
              {tokens.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                    <Search className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-lg font-medium text-slate-400">No verified tokens yet.</p>
                  <p className="text-sm max-w-sm">Dump the Dune data and run the scanner to find tokens with an active Mint Authority.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#1A1A1E] sticky top-0 z-10 shadow-md">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Token Mint</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bricked SOL</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Authority</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {tokens.map((t, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 text-xs font-bold text-indigo-300">
                              {t.symbol ? t.symbol.substring(0,2).toUpperCase() : '?'}
                            </div>
                            <div>
                              <div className="font-medium text-slate-200">
                                {t.symbol || 'Unknown'}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-xs text-slate-500 font-mono">
                                  {t.token_mint_address.substring(0, 8)}...{t.token_mint_address.substring(t.token_mint_address.length - 8)}
                                </span>
                                <button
                                  onClick={() => handleCopy(t.token_mint_address, `mint-${t.token_mint_address}`)}
                                  className="p-1 rounded-md hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                                  title="Copy full mint address"
                                >
                                  {copiedId === `mint-${t.token_mint_address}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-emerald-400">
                            {t.bricked_sol || t.sol_balance ? parseFloat(t.bricked_sol || t.sol_balance).toFixed(4) : '?'} SOL
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {t.mint_authority ? (
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-mono text-slate-300 bg-white/5 px-3 py-1.5 rounded-lg inline-block border border-white/5">
                                {`${t.mint_authority.substring(0, 6)}...${t.mint_authority.substring(t.mint_authority.length - 6)}`}
                              </div>
                              <button
                                onClick={() => handleCopy(t.mint_authority, `auth-${t.token_mint_address}`)}
                                className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                title="Copy full authority address"
                              >
                                {copiedId === `auth-${t.token_mint_address}` ? (
                                  <Check className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500 font-mono">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a 
                            href={`https://solscan.io/token/${t.token_mint_address}#authorities`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-indigo-500 transition-all shadow-sm"
                            title="View on Solscan"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
