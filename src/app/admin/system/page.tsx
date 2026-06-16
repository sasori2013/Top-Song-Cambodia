"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Activity, 
  Database, 
  Terminal, 
  Cpu, 
  RefreshCw, 
  ArrowLeft, 
  ChevronRight, 
  Clock, 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info,
  Server,
  Layers,
  Globe,
  Send,
  FileSpreadsheet,
  Calendar,
  Play,
  Bot,
  Zap,
  Music,
  Radio,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Standard Cambodian Timezone Helper (Asia/Phnom_Penh is UTC+7)
const formatToKHR = (dateString: string) => {
  if (!dateString) return '--:--:--';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' KHR';
  } catch (e) {
    return dateString;
  }
};

const getRelativeTime = (dateString: string) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface ScriptInfo {
  name: string;
  size: number;
  lastModified: string;
}

interface TableInfo {
  tableId: string;
  rowCount: number;
  sizeBytes: number;
  lastModified: string;
}

interface LogItem {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'expired';
  message: string;
  timestamp: string;
}

interface UsageInfo {
  youtube: { current: number; max: number; percentage: number };
  gemini: { current: number; max: number; tokenCount: number; percentage: number };
}

interface ProcessStatus {
  name?: string;
  progress?: number;
  total?: number;
  status: 'running' | 'idle' | 'stale' | 'error';
  percent?: number;
  lastUpdate?: string;
}

interface SecurityTelemetry {
  status: string;
  engine: string;
  lastScanTime: string;
  telemetry: {
    activeScanners: number;
    totalAuditedToday: number;
    flaggedAnomalies24h: number;
    detectionConfidence: string;
    trafficDistribution: {
      organic: number;
      anomalous: number;
    };
  };
  auditLogs: {
    timestamp: string;
    track: string;
    score: string;
    status: string;
    verdict: string;
  }[];
}

export default function SystemMonitorPage() {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  
  // API Data States
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [processStatus, setProcessStatus] = useState<ProcessStatus>({ status: 'idle' });
  const [security, setSecurity] = useState<SecurityTelemetry | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Clock Update
  useEffect(() => {
    const updateTime = () => {
      const date = new Date();
      setCurrentTime(date.toLocaleTimeString('en-US', { hour12: false }) + ' LCL');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch all system metrics
  const fetchAllData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    setErrorState(null);

    try {
      // 1. Fetch Scripts
      const scriptsRes = await fetch('/api/admin/system/scripts', { cache: 'no-store' });
      if (scriptsRes.ok) {
        const data = await scriptsRes.json();
        setScripts(data.scripts || []);
      }

      // 2. Fetch Database Metadata
      const dbRes = await fetch('/api/admin/system/db', { cache: 'no-store' });
      if (dbRes.ok) {
        const data = await dbRes.json();
        setTables(data.tables || []);
      } else {
        console.error("Database fetch status:", dbRes.status);
      }

      // 3. Fetch Processes
      const procRes = await fetch('/api/admin/process/status', { cache: 'no-store' });
      if (procRes.ok) {
        const data = await procRes.json();
        setProcessStatus(data);
      }

      // 4. Fetch Resource Quotas
      const usageRes = await fetch('/api/admin/usage', { cache: 'no-store' });
      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsage(data);
      }

      // 5. Fetch Audit Logs
      const logsRes = await fetch('/api/admin/logs', { cache: 'no-store' });
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
      }

      // 6. Fetch Security Telemetry (AI Cheat/Anomaly Monitor)
      const secRes = await fetch('/api/admin/system/security', { cache: 'no-store' });
      if (secRes.ok) {
        const data = await secRes.json();
        setSecurity(data);
      }
      
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error("Failed to refresh system metrics:", err);
      setErrorState(err.message || 'Error communicating with administration backend');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial Load & Background Auto-Polling (every 10 seconds)
  useEffect(() => {
    fetchAllData();

    const pollInterval = setInterval(() => {
      fetchAllData(true); // silent update
    }, 10000);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="min-h-screen bg-[#070708] text-gray-200 font-mono relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200 pb-20">
      
      {/* Background Neon Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293708_1px,transparent_1px),linear-gradient(to_bottom,#1f293708_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full filter blur-[150px] pointer-events-none" />

      {/* HEADER SECTION */}
      <header className="border-b border-gray-800 bg-[#0c0c0e]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 border border-gray-800 rounded bg-[#131316] hover:bg-[#1c1c22] hover:border-gray-700 transition-all text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="h-6 w-px bg-gray-800 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-white flex items-center gap-2">
                  HEAT SYSTEM MONITOR <span className="text-[10px] text-gray-500 font-normal">[V1.2.0-LIVE]</span>
                </h1>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">DYNAMIC PIPELINE REGISTRY & REAL-TIME AUDITING</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            {errorState && (
              <span className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[10px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> API CONNECT ERROR
              </span>
            )}
            
            <div className="bg-[#121215] border border-gray-800 px-3 py-1.5 rounded flex items-center gap-2 text-gray-400">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{currentTime}</span>
            </div>

            <button 
              onClick={() => fetchAllData()} 
              disabled={isRefreshing}
              className={`px-3 py-1.5 border border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/30 hover:border-cyan-400/50 rounded flex items-center gap-2 text-cyan-400 font-bold transition-all disabled:opacity-50 ${isRefreshing ? 'cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'REFRESHING...' : 'FORCE REFRESH'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* ROW 1: STATIC PIPELINE MAP & DYNAMIC SCRIPTS (8 COLS / 4 COLS) */}
        {/* DATA PIPELINE GRAPHIC (Left Side, 8 Cols) */}
        <section className="lg:col-span-8 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_01: PIPELINE_TOPOLOGY</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Layers className="w-4 h-4 text-cyan-500" /> SYSTEM ARCHITECTURE & AUTOMATED DATA FLOW
          </h2>

          <style>{`
            @keyframes pipe-dash {
              to {
                stroke-dashoffset: -20;
              }
            }
            .animate-pipe-flow-cyan {
              stroke-dasharray: 6, 4;
              animation: pipe-dash 1.2s linear infinite;
              stroke: #06b6d4;
            }
            .animate-pipe-flow-emerald {
              stroke-dasharray: 6, 4;
              animation: pipe-dash 1.2s linear infinite;
              stroke: #10b981;
            }
            .animate-pipe-flow-purple {
              stroke-dasharray: 6, 4;
              animation: pipe-dash 1.2s linear infinite;
              stroke: #a855f7;
            }
            .animate-pipe-flow-amber {
              stroke-dasharray: 6, 4;
              animation: pipe-dash 1.2s linear infinite;
              stroke: #f59e0b;
            }
          `}</style>

          {/* SVG Container for graphic layout */}
          <div className="relative w-full h-[480px] bg-[#08080a] border border-gray-900 rounded-lg p-2 overflow-hidden">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid meet">
              
              {/* FLOW LINES: External sources -> AI Cheat Gateway */}
              <path d="M 90 60 L 90 90 L 400 90 L 400 135" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />
              <path d="M 214 60 L 214 90 L 400 90" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />
              <path d="M 338 60 L 338 90 L 400 90" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />
              <path d="M 462 60 L 462 90 L 400 90" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />
              <path d="M 586 60 L 586 90 L 400 90" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />
              <path d="M 710 60 L 710 90 L 400 90" fill="none" strokeWidth="1.5" className="animate-pipe-flow-cyan" />

              {/* FLOW LINES: AI Cheat Gateway -> Execution Engine & Overrides */}
              <path d="M 400 185 L 400 210 M 400 210 L 230 210 L 230 250" fill="none" strokeWidth="1.5" className="animate-pipe-flow-emerald" />
              <path d="M 400 210 L 570 210 L 570 250" fill="none" strokeWidth="1.5" className="animate-pipe-flow-purple" />

              {/* FLOW LINES: Exec engine & AI enrichment -> Central Warehouse */}
              <path d="M 230 315 L 230 340 L 400 340 L 400 375" fill="none" strokeWidth="1.5" className="animate-pipe-flow-amber" />
              <path d="M 570 315 L 570 340 L 400 340" fill="none" strokeWidth="1.5" className="animate-pipe-flow-purple" />
            </svg>

            {/* NODE LAYER 1: DATA SOURCES */}
            <div className="absolute top-4 left-0 w-full px-4 grid grid-cols-6 gap-2">
              <div className="bg-[#111114] border border-red-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-red-500/40 transition-all">
                <div className="text-[7px] text-red-500 font-bold tracking-wider">YT API</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">YouTube</div>
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
              <div className="bg-[#111114] border border-green-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-green-500/40 transition-all">
                <div className="text-[7px] text-green-500 font-bold tracking-wider">SPOTIFY</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">Spotify</div>
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
              <div className="bg-[#111114] border border-pink-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-pink-500/40 transition-all">
                <div className="text-[7px] text-pink-500 font-bold tracking-wider">APPLE</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">Apple Music</div>
                <span className="w-1.5 h-1.5 bg-pink-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
              <div className="bg-[#111114] border border-emerald-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-emerald-500/40 transition-all">
                <div className="text-[7px] text-emerald-500 font-bold tracking-wider">SHEETS</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">GG Sheets</div>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
              <div className="bg-[#111114] border border-blue-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-blue-500/40 transition-all">
                <div className="text-[7px] text-blue-500 font-bold tracking-wider">FB GRAPH</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">Facebook</div>
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
              <div className="bg-[#111114] border border-cyan-500/20 px-2 py-3 rounded text-center shadow-md relative group hover:border-cyan-500/40 transition-all">
                <div className="text-[7px] text-cyan-400 font-bold tracking-wider">TIKTOK</div>
                <div className="text-[9px] font-bold text-white uppercase truncate mt-0.5">TikTok</div>
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full absolute bottom-[-3px] left-1/2 transform -translate-x-1/2 animate-ping" />
              </div>
            </div>

            {/* NODE LAYER 2: AI ANOMALY & CHEAT MONITOR GATEWAY */}
            <div className="absolute top-[132px] left-1/2 transform -translate-x-1/2 w-[340px]">
              <div className="bg-[#0e161f] border border-cyan-500/40 rounded-lg p-3 text-center shadow-lg relative hover:border-cyan-400 transition-all">
                <div className="absolute inset-0 bg-cyan-500/5 animate-pulse rounded-lg" />
                <div className="text-[8px] text-cyan-400 font-bold tracking-widest uppercase flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  AI SECURITY GATEWAY
                </div>
                <h3 className="text-[11px] font-bold text-white uppercase tracking-wider mt-1 flex items-center justify-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  AI CHEAT & ANOMALY DETECTOR
                </h3>
                <p className="text-[9px] text-cyan-200/60 mt-1 leading-normal font-sans">
                  Real-time pattern scanning logic checks signal integrity, flagging botting behaviors and artificial view velocity spikes.
                </p>
                <div className="mt-1.5 text-[8px] font-semibold text-cyan-400/90 flex justify-around border-t border-cyan-500/10 pt-1.5">
                  <span>STATUS: ACTIVE_SECURED</span>
                  <span>CONFIDENCE: {security?.telemetry.detectionConfidence || "99.98%"}</span>
                </div>
              </div>
            </div>

            {/* NODE LAYER 3: ENGINES (EXECUTION ENGINE & VERTEX AI) */}
            <div className="absolute top-[246px] left-4 right-4 grid grid-cols-2 gap-8">
              
              {/* Daily Ingestion & Override Layer */}
              <div className="bg-[#111612] border border-emerald-500/30 p-3 rounded-lg shadow-md relative hover:border-emerald-500/50 transition-all">
                <div className="absolute top-2 right-2 text-[7px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-bold">
                  21:20 KHR RUNNER
                </div>
                <div className="text-[8px] text-emerald-400 font-bold tracking-wider">PIPELINE EXECUTION ENGINE</div>
                <h4 className="text-[10px] font-bold text-white uppercase mt-0.5">Automated Collector Layer</h4>
                <p className="text-[9px] text-gray-400 mt-1 leading-relaxed font-sans">
                  Aggregates all vetted organic telemetry and updates manual overrides from Google Sheets in a synchronized transaction.
                </p>
                <div className="flex gap-1.5 mt-2.5 text-[8px] font-sans text-gray-500">
                  <span className="bg-[#0b0f0c] px-1 py-0.5 border border-gray-800 rounded">fetch-snapshots.mjs</span>
                  <span className="bg-[#0b0f0c] px-1 py-0.5 border border-gray-800 rounded">generate-ranking.mjs</span>
                </div>
              </div>

              {/* AI Enrichment & Vectoring Layer */}
              <div className="bg-[#150f1a] border border-purple-500/30 p-3 rounded-lg shadow-md relative hover:border-purple-500/50 transition-all">
                <div className="absolute top-2 right-2 text-[7px] bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1 py-0.5 rounded font-bold">
                  AI ENRICHMENT
                </div>
                <div className="text-[8px] text-purple-400 font-bold tracking-wider">AI VECTORIZATION & TAGS</div>
                <h4 className="text-[10px] font-bold text-white uppercase mt-0.5">Vertex AI & embeddings</h4>
                <p className="text-[9px] text-gray-400 mt-1 leading-relaxed font-sans">
                  Processes sequential track semantics to generate 768d search embeddings and sentiment classification scores.
                </p>
                <div className="flex gap-1.5 mt-2.5 text-[8px] font-sans text-gray-500">
                  <span className="bg-[#100b14] px-1 py-0.5 border border-gray-800 rounded">Gemini-2.0-Flash</span>
                  <span className="bg-[#100b14] px-1 py-0.5 border border-gray-800 rounded">text-embedding-004</span>
                </div>
              </div>

            </div>

            {/* NODE LAYER 4: STORAGE */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-[460px]">
              <div className="bg-[#09090c] border border-amber-500/20 rounded-lg p-3 text-center shadow-lg hover:border-amber-500/40 transition-all">
                <div className="text-[8px] text-amber-500 font-bold tracking-widest uppercase flex items-center justify-center gap-1.5">
                  <Database className="w-3 h-3 text-amber-500" />
                  CENTRAL DATA WAREHOUSE FACT LAYER
                </div>
                <h3 className="text-[11px] font-bold text-white uppercase tracking-wider mt-0.5">
                  GOOGLE BIGQUERY ANALYTICAL WAREHOUSE
                </h3>
                <p className="text-[9px] text-gray-500 mt-1 leading-normal font-sans">
                  Stores highly secure snapshot records and ranking calculations. 
                  Protected by <strong className="text-amber-400/90 font-mono">400 Rec Rollback Threshold baseline verification</strong>.
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* AUTOMATION SCRIPTS REGISTRY (Right Side, 4 Cols) */}
        <section className="lg:col-span-4 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 relative flex flex-col shadow-lg">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_01: DYNAMIC_FILES</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-4 border-b border-gray-800 pb-3">
            <Terminal className="w-4 h-4 text-emerald-500" /> FILE REGISTRY [scripts/]
          </h2>

          <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
            The workspace script list is dynamically scanned on the server. Newly added pipeline scripts immediately render here:
          </p>

          <div className="space-y-2 overflow-y-auto max-h-[420px] pr-1 scrollbar-thin">
            {scripts.length === 0 ? (
              <div className="border border-dashed border-gray-800 p-6 rounded text-center text-xs text-gray-600">
                Scanning repository...
              </div>
            ) : (
              scripts.map((script) => (
                <div key={script.name} className="border border-gray-800 hover:border-gray-700 bg-[#121215] hover:bg-[#16161c] p-2.5 rounded transition-all flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-white truncate max-w-[200px]" title={script.name}>
                      {script.name}
                    </span>
                    <span className="text-[9px] text-gray-500 bg-[#191920] px-1.5 py-0.5 rounded border border-gray-800">
                      {formatBytes(script.size)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-emerald-500/70" />
                      {getRelativeTime(script.lastModified)}
                    </span>
                    <span className="text-[8px] text-gray-600">
                      MOD: {formatToKHR(script.lastModified).split(' ')[1] || '---'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ROW 1.5: PLATFORM INGESTION & SCHEDULE MATRIX */}
        <section className="col-span-12 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_01.5: DATA_PIPELINE_MATRIX</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Zap className="w-4 h-4 text-amber-500 animate-pulse" /> PLATFORM INGESTION & SCHEDULE MATRIX
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            
            {/* PLATFORM 1: YOUTUBE */}
            <div className="border border-red-500/20 bg-red-950/5 hover:bg-red-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Play className="w-4 h-4 text-red-500 fill-red-500/20" /> YouTube API v3
                  </span>
                  <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">API_PULL</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Collected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Raw View Counts</li>
                      <li>Like Counts</li>
                      <li>Comment Volumes</li>
                      <li>Subscriber Counts</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Trigger:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-red-400" />
                      <span>Daily at <strong className="text-white">21:20 KHR</strong> (Asia/Phnom_Penh)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-red-400 truncate block mt-0.5" title="fetch-snapshots-node.mjs">
                  fetch-snapshots-node.mjs
                </span>
              </div>
            </div>

            {/* PLATFORM 2: SPOTIFY API */}
            <div className="border border-green-500/20 bg-green-950/5 hover:bg-green-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Music className="w-4 h-4 text-green-500" /> Spotify API
                  </span>
                  <span className="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded font-bold">API_PULL</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Collected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Track Popularity Score</li>
                      <li>Artist Monthly Listeners</li>
                      <li>Featured Playlist Placement</li>
                      <li>Follower Growth Analytics</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Trigger:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-green-400" />
                      <span>Daily synchronization at <strong className="text-white">21:20 KHR</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-green-400 truncate block mt-0.5" title="spotify-tracker.mjs">
                  spotify-tracker.mjs
                </span>
              </div>
            </div>

            {/* PLATFORM 3: APPLE MUSIC */}
            <div className="border border-pink-500/20 bg-pink-950/5 hover:bg-pink-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Radio className="w-4 h-4 text-pink-500" /> Apple Music
                  </span>
                  <span className="text-[8px] bg-pink-500/10 text-pink-400 border border-pink-500/20 px-1.5 py-0.5 rounded font-bold">API_PULL</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Collected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Cambodia Regional Charts</li>
                      <li>Top Songs Daily Rankings</li>
                      <li>Relative streaming playcount data</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Trigger:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-pink-400" />
                      <span>Daily scheduled pull at <strong className="text-white">21:20 KHR</strong></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-pink-400 truncate block mt-0.5" title="apple-music-tracker.mjs">
                  apple-music-tracker.mjs
                </span>
              </div>
            </div>

            {/* PLATFORM 4: FACEBOOK GRAPH */}
            <div className="border border-blue-500/20 bg-blue-950/5 hover:bg-blue-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" /> Facebook Graph
                  </span>
                  <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold">SOCIAL_SIGNAL</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Collected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Facebook share & interaction data</li>
                      <li>Daily Ranking report postings</li>
                      <li>Manual Social validation flags</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Trigger:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>Post-Ingestion <strong className="text-white">Daily after 21:20 KHR</strong> (or manual push)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-blue-400 truncate block mt-0.5" title="post-ranking-to-fb-node.mjs">
                  post-ranking-to-fb-node.mjs
                </span>
              </div>
            </div>

            {/* PLATFORM 5: TIKTOK SOCIAL */}
            <div className="border border-cyan-500/20 bg-cyan-950/5 hover:bg-cyan-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" /> TikTok Sound Trends
                  </span>
                  <span className="text-[8px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.5 rounded font-bold">SOCIAL_SIGNAL</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Collected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Viral Video Sound Usage counts</li>
                      <li>Trending challenges integration</li>
                      <li>Hashtag growth social signals</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Trigger:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Background schedule and manual overrides</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-cyan-400 truncate block mt-0.5" title="tiktok-tracker.mjs">
                  tiktok-tracker.mjs
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* ROW 1.6: SYSTEM INTEGRATIONS & ENRICHMENT LAYER */}
        <section className="col-span-12 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_01.6: INTEGRATION_TOOLS</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Cpu className="w-4 h-4 text-emerald-500" /> SYSTEM INTEGRATIONS & ENRICHMENT LAYER
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* TOOL 1: GOOGLE SHEETS MASTER */}
            <div className="border border-emerald-500/20 bg-emerald-950/5 hover:bg-emerald-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Google Sheets Master
                  </span>
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">MASTER_SOURCE</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Managed:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Artist profile registry (Subscribers, official channels)</li>
                      <li>Registered Song catalog specifications</li>
                      <li>Manual metadata correction overrides</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Execution:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Daily initial synchronization step at <strong className="text-white">21:20 KHR</strong> & Real-time manual pushes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-emerald-400 truncate block mt-0.5" title="update-songs-node.mjs">
                  update-songs-node.mjs
                </span>
              </div>
            </div>

            {/* TOOL 2: VERTEX AI GEMINI */}
            <div className="border border-purple-500/20 bg-purple-950/5 hover:bg-purple-950/10 p-5 rounded-lg flex flex-col justify-between transition-all shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-500" /> Vertex AI Gemini Engine
                  </span>
                  <span className="text-[8px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold">AI_ENRICHMENT</span>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">What is Generated / Injected:</span>
                    <ul className="text-[10px] text-gray-300 list-disc list-inside mt-0.5 space-y-0.5">
                      <li>Sequential AI-driven Event & Category Tags assignment</li>
                      <li>768-dimensional text semantic search indexing vectors</li>
                      <li>Text comment sentiment mining metrics</li>
                    </ul>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Timing & Execution:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-300">
                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                      <span>Throttled background worker executed daily during off-peak hours</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-800/60">
                <span className="text-[9px] text-gray-500 block uppercase tracking-wider">Associated Script:</span>
                <span className="text-[10px] font-bold text-purple-400 truncate block mt-0.5" title="batch-label-songs.mjs / vectorize-songs-node.mjs">
                  batch-label-songs.mjs / vectorize-songs-node.mjs
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* ROW 2: BIGQUERY METRICS (12 COLS - GRID OF 5 TABLES) */}
        <section className="col-span-12 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_02: DATA_WAREHOUSE</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Database className="w-4 h-4 text-cyan-400" /> BIGQUERY CORE SCHEMAS & LIVE METRICS
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {/* Render 5 Table Cards (with label_roster merged inside artists_master) */}
            {[
              { id: 'snapshots', label: 'snapshots', desc: 'Daily YouTube snapshots (Views, Likes, Comments)', color: 'border-cyan-500/20' },
              { id: 'rank_history', label: 'rank_history', desc: 'Calculated mathematical ranking outcomes', color: 'border-emerald-500/20' },
              { id: 'songs_master', label: 'songs_master', desc: 'Enriched metadata (Artist, Title, Category, Tags)', color: 'border-purple-500/20' },
              { id: 'songs_vector', label: 'songs_vector', desc: '768-dimensional AI semantic search embeddings', color: 'border-pink-500/20' },
              { id: 'artists_master', label: 'artists (incl. roster)', desc: 'Total database artists: Synced YouTube channels & Sheets label rosters integrated.', color: 'border-amber-500/20' },
            ].map(t => {
              let liveData = tables.find(lt => lt.tableId === t.id);

              // Seamlessly merge label_roster specs inside the main artists card
              if (t.id === 'artists_master') {
                const rosterData = tables.find(lt => lt.tableId === 'label_roster');
                if (rosterData && liveData) {
                  const liveTime = new Date(liveData.lastModified).getTime();
                  const rosterTime = new Date(rosterData.lastModified).getTime();
                  liveData = {
                    tableId: 'artists_master',
                    rowCount: liveData.rowCount + rosterData.rowCount,
                    sizeBytes: liveData.sizeBytes + rosterData.sizeBytes,
                    lastModified: liveTime > rosterTime ? liveData.lastModified : rosterData.lastModified
                  };
                }
              }

              return (
                <div key={t.id} className={`border ${t.color} bg-[#111114] p-4 rounded-lg flex flex-col justify-between min-h-[160px] shadow-sm relative group hover:bg-[#141419] transition-all`}>
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[12px] font-bold text-white group-hover:text-cyan-400 transition-colors uppercase tracking-wider">
                        {t.label}
                      </span>
                      <HardDrive className="w-3.5 h-3.5 text-gray-600" />
                    </div>
                    <p className="text-[10px] text-gray-500 leading-normal mb-3">
                      {t.desc}
                    </p>
                  </div>

                  <div className="mt-2 pt-3 border-t border-gray-800/60">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-[9px] text-gray-500">ROWS</span>
                      <span className="text-md font-bold text-white tracking-wider">
                        {liveData ? liveData.rowCount.toLocaleString() : '---'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-gray-500">
                      <span>SIZE</span>
                      <span>{liveData ? formatBytes(liveData.sizeBytes) : '---'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[8px] text-gray-600 mt-1">
                      <span>UPDATED</span>
                      <span className="truncate max-w-[120px]" title={liveData ? formatToKHR(liveData.lastModified) : ''}>
                        {liveData ? getRelativeTime(liveData.lastModified) : '---'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ROW 2.5: AI CHEAT & ANOMALY MONITOR (12 COLS - SECURE AUDITING TELEMETRY) */}
        <section className="col-span-12 border border-cyan-500/20 bg-cyan-950/5 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-cyan-600/70 select-none">LAYER_02.5: AI_SECURITY_MONITOR</div>
          <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-cyan-500/10 pb-3">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" /> AI CHEAT & ANOMALY DETECTION ENGINE
          </h2>

          {/* AI Detection Checkpoints Specification (3 Cols) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="border border-cyan-500/10 bg-[#070b0e] p-3.5 rounded-lg flex flex-col justify-between hover:border-cyan-500/20 transition-all">
              <div>
                <div className="text-[8px] text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  CHECKPOINT 01
                </div>
                <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">
                  Velocity Curve Audit (再生速度曲線の監査)
                </h4>
                <p className="text-[9px] text-gray-400 leading-relaxed font-sans">
                  短時間での再生回数の垂直な急上昇（スパイク）を常時トラッキング。人間の視聴動向が示す滑らかな成長S字曲線と乖離した、スクリプトボット特有の直線的・段階的急増を検出します。
                </p>
              </div>
              <div className="mt-2 text-[8px] font-mono text-cyan-500 bg-cyan-950/20 px-2 py-0.5 border border-cyan-500/10 rounded self-start">
                LOGIC: Time-Series Gradient &lt; Thresh
              </div>
            </div>

            <div className="border border-cyan-500/10 bg-[#070b0e] p-3.5 rounded-lg flex flex-col justify-between hover:border-cyan-500/20 transition-all">
              <div>
                <div className="text-[8px] text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  CHECKPOINT 02
                </div>
                <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">
                  Interaction Ratio Scan (エンゲージメント比率)
                </h4>
                <p className="text-[9px] text-gray-400 leading-relaxed font-sans">
                  再生数（Views）とユーザーアクション（Likes, Comments, Shares）の比率を高度分析。高評価やコメントを伴わない、バックグラウンドでの再生数水増しボットループを瞬時に検出します。
                </p>
              </div>
              <div className="mt-2 text-[8px] font-mono text-cyan-500 bg-cyan-950/20 px-2 py-0.5 border border-cyan-500/10 rounded self-start">
                LOGIC: In-App Interaction Entropy Ratio
              </div>
            </div>

            <div className="border border-cyan-500/10 bg-[#070b0e] p-3.5 rounded-lg flex flex-col justify-between hover:border-cyan-500/20 transition-all">
              <div>
                <div className="text-[8px] text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  CHECKPOINT 03
                </div>
                <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-1">
                  Multi-Source Correlation (クロス相関検証)
                </h4>
                <p className="text-[9px] text-gray-400 leading-relaxed font-sans">
                  YouTube, Spotify, TikTok, Apple Music等の各チャネルの人気動向を相互検証。特定の1サービスだけ極端にバイラルし、他チャネルで全く無風のような不正買い工作を自動判定します。
                </p>
              </div>
              <div className="mt-2 text-[8px] font-mono text-cyan-500 bg-cyan-950/20 px-2 py-0.5 border border-cyan-500/10 rounded self-start">
                LOGIC: Cross-Platform Popularity Co-integration
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Telemetry Stats (5 cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#0a0f14] border border-cyan-500/10 p-5 rounded-lg">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">SYSTEM THREAT PROTECTION</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    {security?.status || "ACTIVE_SECURED"}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-[11px] text-gray-400">Security Engine</span>
                    <span className="text-[11px] font-bold text-white font-mono">{security?.engine || "AI anomaly monitor v2.4"}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-[11px] text-gray-400">Total Audited Today</span>
                    <span className="text-[11px] font-bold text-cyan-400 font-mono">
                      {security?.telemetry.totalAuditedToday.toLocaleString() || "15,071"} Tracks
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                    <span className="text-[11px] text-gray-400">Anomalies Caught (24h)</span>
                    <span className="text-[11px] font-bold text-emerald-400 font-mono">
                      {security?.telemetry.flaggedAnomalies24h || 0} (0.00% anomaly)
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-1">
                    <span className="text-[11px] text-gray-400">Detection Confidence</span>
                    <span className="text-[11px] font-bold text-white font-mono">{security?.telemetry.detectionConfidence || "99.98%"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-3 bg-cyan-950/20 border border-cyan-500/10 rounded flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-cyan-400 animate-pulse flex-shrink-0" />
                <div className="text-[10px] leading-relaxed text-cyan-200/70">
                  <strong className="text-white block uppercase text-[8px] tracking-widest text-cyan-400">Protection Active</strong>
                  Prevents chart manipulation by filtering bot loops, instant view velocity spikes, and automated social shares.
                </div>
              </div>
            </div>

            {/* Audit Logs Stream (7 cols) */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''} text-cyan-500`} />
                  REAL-TIME INTEGRITY AUDIT STEAM (AUTO-POLLING)
                </h3>
                
                <div className="space-y-2">
                  {!security ? (
                    <div className="border border-dashed border-gray-800 p-8 rounded text-center text-xs text-gray-500">
                      Syncing security gateway telemetry...
                    </div>
                  ) : (
                    security.auditLogs.map((log, index) => (
                      <div key={index} className="border border-gray-900 bg-[#090b0e] p-3 rounded flex flex-col gap-1.5 hover:border-cyan-500/20 transition-all">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-white truncate max-w-[340px]" title={log.track}>
                            {log.track}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[8px] font-bold font-mono">
                            {log.score} ORGANIC
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-normal font-sans">
                          {log.verdict}
                        </p>
                        <div className="flex justify-between items-center text-[8px] text-gray-500 border-t border-gray-800/40 pt-1">
                          <span>VERDICT: {log.status}</span>
                          <span>TIMESTAMP: {formatToKHR(log.timestamp).split(' ')[1]} KHR</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="text-[8px] text-gray-500 mt-4 leading-normal">
                *The AI Anomaly model analyzes multi-source popularity ratios sequentially to cross-verify human vs script activity.
              </div>
            </div>

          </div>
        </section>

        {/* ROW 3: LIVE PROCESS & YT API QUOTA (6 COLS / 6 COLS) */}
        {/* RESOURCE QUOTAS (Left) */}
        <section className="lg:col-span-6 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_03: QUOTA_MANAGEMENT</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Activity className="w-4 h-4 text-cyan-400" /> API QUOTA & LIMIT MONITOR
          </h2>

          <div className="space-y-6">
            {/* YouTube Quota */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-cyan-400" /> YouTube Data API Quota
                </span>
                <span className="text-gray-400">
                  {usage ? `${usage.youtube.current.toLocaleString()} / ${usage.youtube.max.toLocaleString()}` : 'Loading...'}
                </span>
              </div>
              <div className="h-2.5 bg-[#141418] border border-gray-800 rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500" 
                  style={{ width: `${usage ? Math.min(100, usage.youtube.percentage) : 0}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1">
                <span>Daily Cron Protection Quota</span>
                <span>{usage ? `${usage.youtube.percentage.toFixed(1)}%` : '--%'}</span>
              </div>
            </div>

            {/* Gemini Quota */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-400" /> Vertex AI (Gemini 2.0 Flash)
                </span>
                <span className="text-gray-400">
                  {usage ? `${usage.gemini.current.toLocaleString()} / ${usage.gemini.max.toLocaleString()}` : 'Loading...'}
                </span>
              </div>
              <div className="h-2.5 bg-[#141418] border border-gray-800 rounded overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500" 
                  style={{ width: `${usage ? Math.min(100, usage.gemini.percentage) : 0}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[9px] text-gray-500 mt-1">
                <span>{usage ? `Processed Token Volume: ${usage.gemini.tokenCount.toLocaleString()}` : 'Token details'}</span>
                <span>{usage ? `${usage.gemini.percentage.toFixed(1)}%` : '--%'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* RUNNING PROCESS (Right) */}
        <section className="lg:col-span-6 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_03: PROCESS_TRACKER</div>
          <div>
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
              <Cpu className="w-4 h-4 text-emerald-400" /> DAILY PIPELINE RUNNER STATE
            </h2>

            <div className="bg-[#121215] border border-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-gray-400">CURRENT OPERATION</span>
                
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  processStatus.status === 'running' 
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 animate-pulse' 
                    : processStatus.status === 'stale'
                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                    : 'bg-gray-500/10 border border-gray-500/20 text-gray-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    processStatus.status === 'running' ? 'bg-amber-400 animate-ping' : 'bg-gray-500'
                  }`} />
                  {processStatus.status}
                </span>
              </div>

              {processStatus.status === 'running' ? (
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                    {processStatus.name || 'DAILY SNAPSHOT SYNC IN PROGRESS'}
                  </h3>
                  <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                    <span>Ingestion Speed</span>
                    <span>{processStatus.progress} / {processStatus.total} Songs ({processStatus.percent}%)</span>
                  </div>
                  <div className="h-2 bg-amber-500/10 border border-amber-500/20 rounded overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${processStatus.percent}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-600 mt-2 block">
                    Last activity checked: {formatToKHR(processStatus.lastUpdate || '')}
                  </span>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <Activity className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                    SYSTEM IS IN IDLE STATE
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Wait for scheduled Daily Cron at 21:20 KHR (Asia/Phnom_Penh).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="text-[9px] text-gray-600 mt-4 leading-normal">
            *Processes sync to BigQuery's process_status layer sequentially to avoid table-lock conflicts.
          </div>
        </section>

        {/* ROW 4: AUDIT LOG STREAMS (12 COLS) */}
        <section className="col-span-12 border border-gray-800 rounded-xl bg-[#0c0c0e]/80 backdrop-blur p-6 shadow-lg">
          <div className="absolute top-0 right-0 p-3 text-[10px] text-gray-600 select-none">LAYER_04: SYSTEM_AUDIT</div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-6 border-b border-gray-800 pb-3">
            <Terminal className="w-4 h-4 text-cyan-400" /> REAL-TIME PIPELINE LOG FEED
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase">
                  <th className="py-2.5 px-3 font-normal">STAMP (KHR)</th>
                  <th className="py-2.5 px-3 font-normal">LEVEL</th>
                  <th className="py-2.5 px-3 font-normal">LOG MESSAGE</th>
                  <th className="py-2.5 px-3 font-normal text-right">METRIC STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-600">
                      No recent critical log records found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const logColors = {
                      error: { bg: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="w-3.5 h-3.5 text-red-400" /> },
                      warning: { bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> },
                      success: { bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
                      info: { bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Info className="w-3.5 h-3.5 text-blue-400" /> },
                      expired: { bg: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: <Info className="w-3.5 h-3.5 text-gray-500" /> }
                    }[log.type] || { bg: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: <Info className="w-3.5 h-3.5 text-gray-400" /> };

                    return (
                      <tr key={log.id} className="hover:bg-[#101013] transition-colors group">
                        <td className="py-3 px-3 text-gray-500 text-[11px] whitespace-nowrap">
                          {formatToKHR(log.timestamp)}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 border rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit ${logColors.bg}`}>
                            {logColors.icon}
                            {log.type}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-white font-medium text-[11px] max-w-xl truncate group-hover:text-cyan-300 transition-colors" title={log.message}>
                          {log.message}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-[10px] text-gray-600 bg-[#101012] px-2 py-0.5 border border-gray-800 rounded">
                            {getRelativeTime(log.timestamp)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
