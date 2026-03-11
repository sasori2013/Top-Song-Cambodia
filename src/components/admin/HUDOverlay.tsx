"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { 
  BarGraph, 
  DotGrid, 
  MetricCircle, 
  AnimatedCounter, 
  TypewriterText, 
  BlinkingIndicator, 
  MillisecondTimer, 
  NotificationPanel,
  SmoothWaveVisualizer,
  FaceTargetCircle,
  ResourceMonitor,
  TechBracket,
  type NotificationItem
} from './HUDGraphics';

interface TelemetryBlockProps {
  title: string;
  value: string | undefined;
  sub?: string;
  align?: "left" | "right";
}

const TelemetryBlock = ({ title, value, sub, align = "left" }: TelemetryBlockProps) => (
  <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"} uppercase`}>
    <div className="text-[9px] opacity-40 tracking-widest mb-1">
      {title.toUpperCase().replace(/_/g, ' ')}
    </div>
    <div className="text-xl font-bold leading-none uppercase text-black" suppressHydrationWarning>
      {value}{sub ? ` - ${sub}` : ""}
    </div>
  </div>
);

interface MetricWithCircleProps {
  title: string;
  value: string | number;
  circleLabel: string;
  rotationDuration: string;
  dashArray: string;
  glowOnUpdate?: boolean;
  increase?: number;
  subMetrics?: { label: string; value: number | string }[];
}

const MetricWithCircle = ({ title, value, circleLabel, rotationDuration, dashArray, glowOnUpdate = false, increase, subMetrics }: MetricWithCircleProps) => (
  <div className="flex flex-col items-start uppercase w-[240px] py-0.5">
    <div className="text-[11px] font-black text-black tracking-[0.2em] mb-1 flex items-center gap-2">
      {title.toUpperCase()}
      {increase !== undefined && (
        <span className="text-[10px] font-black bg-black text-white px-1.5 py-0.5 rounded-sm tracking-tighter shadow-sm">
          +{increase}
        </span>
      )}
    </div>
    <div className="flex items-center gap-4">
      <MetricCircle 
        label={circleLabel} 
        size={70} 
        color="#000" 
        rotationDuration={rotationDuration} 
        dashArray={dashArray} 
      />
      <div className="flex flex-col justify-center">
        <div className="text-5xl font-black text-black leading-none uppercase -mt-2 tracking-tighter tabular-nums scale-y-110 origin-bottom">
          <AnimatedCounter value={value} color="#000" glowOnUpdate={glowOnUpdate} />
        </div>
        {subMetrics && subMetrics.length > 0 && (
          <div className="flex gap-3 mt-2">
            {subMetrics.map((sm, i) => (
              <div key={i} className="flex flex-col">
                 <span className="text-[9px] text-black opacity-40 tracking-[0.2em] font-black leading-none mb-0.5">{sm.label}</span>
                 <span className="text-xs font-mono font-black tracking-tighter leading-none text-black">
                   {sm.label === "EXPIRED" ? "-" : "+"}{sm.value}
                 </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const MartianBranding = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col gap-0 border-black mt-1 ${className}`}>
    <div className="text-xs font-bold tracking-[0.3em] uppercase text-black mb-1 opacity-70">
      <TypewriterText text="AUTH :: ADMIN" delay={0.03} />
    </div>
    <div className="text-2xl font-black tracking-wider text-black leading-none uppercase">KENICHIRO TAKAMATSU</div>
    <div className="hidden [@media(min-height:801px)]:block text-[10px] tracking-[0.5em] text-black opacity-60 mt-0.5">
      FOUNDER OF THE HEAT // ROOT ACCESS GRANTED
    </div>
  </div>
);

interface HUDOverlayProps {
  guiInverted?: boolean;
  cameraMode?: 'mono' | 'color';
  onToggleGuiInvert?: () => void;
  onToggleCameraMode?: () => void;
  faceData: any;
  sheetData: {
    totalProduction: number;
    totalArtist: number;
    totalTracks: number;
    totalEntries: number;
    increases?: {
      production: number;
      artist: number;
      tracks: number;
      expiredTracks: number;
    };
  };
  time: Date | null;
  env: {
    location: string;
    temp: string;
    coord: string;
  };
}

const HUDOverlay = ({ faceData, sheetData, time, env, guiInverted, cameraMode, onToggleGuiInvert, onToggleCameraMode }: HUDOverlayProps) => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());
  const [micLevels, setMicLevels] = React.useState<number[]>(Array(20).fill(20));

  // Load dismissed IDs on mount
  React.useEffect(() => {
    const saved = localStorage.getItem('hud_dismissed_notifications');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDismissedIds(new Set(parsed));
        }
      } catch (e) {
        console.error("Failed to parse dismissed notifications:", e);
      }
    }
  }, []);
  const [resourceUsage, setResourceUsage] = React.useState({
    youtubeQuota: 0,
    geminiUsage: 0,
    tokenCount: 0
  });

  // Fetch usage data periodically
  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/admin/usage');
      const data = await res.json();
      if (data && !data.error) {
        setResourceUsage({
          youtubeQuota: data.youtube.percentage,
          geminiUsage: data.gemini.percentage,
          tokenCount: data.gemini.tokenCount
        });
      }
    } catch (e) {
      console.error("Failed to fetch usage:", e);
    }
  };

  // Initialize notifications on mount
  React.useEffect(() => {
    setNotifications([]);
    
    fetchUsage();
    const interval = setInterval(fetchUsage, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Microphone Audio Analyzer
  React.useEffect(() => {
    let audioContext: AudioContext;
    let analyzer: AnalyserNode;
    let dataArray: Uint8Array;
    let source: MediaStreamAudioSourceNode;
    let animationFrame: number;
    let stream: MediaStream;

    const initAudio = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyzer = audioContext.createAnalyser();
        
        analyzer.fftSize = 64;
        const bufferLength = analyzer.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyzer);

        const updateLevels = () => {
          analyzer.getByteFrequencyData(dataArray as any);
          const newLevels = Array(20).fill(0).map((_, i) => {
            const dataIndex = Math.floor((i / 20) * 25);
            const val = dataArray[dataIndex];
            const pct = (val / 255) * 100;
            return pct;
          });
          setMicLevels(newLevels);
          animationFrame = requestAnimationFrame(updateLevels);
        };
        updateLevels();
      } catch (err) {
        console.warn('Microphone access denied:', err);
        const fallbackAnim = () => {
           setMicLevels(Array(20).fill(0).map(() => Math.random() * 80 + 20));
           setTimeout(() => { animationFrame = requestAnimationFrame(fallbackAnim); }, 100);
        };
        fallbackAnim();
      }
    };
    initAudio();
    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
    };
  }, []);

  // Fetch actual logs from the API
  React.useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/admin/logs');
        const data = await res.json();
        if (data.logs && data.logs.length > 0) {
          // Filter out dismissed ones using latest state
          setNotifications(data.logs.filter((log: any) => {
            // Check against both the current state and what might have just been loaded
            return !dismissedIds.has(log.id);
          }));
        }
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3600000); // Once per hour
    return () => clearInterval(interval);
  }, [dismissedIds]); // Add dismissedIds to dependency to re-fetch/re-filter if needed

  // Derived state for filtered notifications to ensure it's reactive
  const visibleNotifications = React.useMemo(() => {
    return notifications.filter(n => !dismissedIds.has(n.id));
  }, [notifications, dismissedIds]);

  const isFaceDetected = faceData && faceData.faceLandmarks && faceData.faceLandmarks.length > 0;
  
  const rectData = isFaceDetected ? {
    width: (Math.max(...faceData.faceLandmarks[0].map((l: any) => l.x)) - Math.min(...faceData.faceLandmarks[0].map((l: any) => l.x))) * 100,
    height: (Math.max(...faceData.faceLandmarks[0].map((l: any) => l.y)) - Math.min(...faceData.faceLandmarks[0].map((l: any) => l.y))) * 100,
    left: Math.min(...faceData.faceLandmarks[0].map((l: any) => l.x)) * 100,
    top: Math.min(...faceData.faceLandmarks[0].map((l: any) => l.y)) * 100
  } : null;

  const renderBaseLayout = (showFaceBox = false, rect: any = null) => (
    <motion.div 
      className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute left-6 top-12 bottom-12 w-0.5 bg-black opacity-80" />
      <div className="absolute right-6 top-12 bottom-12 w-0.5 bg-black opacity-80" />

      <div className="absolute left-1/2 -translate-x-1/2 top-12 flex flex-col items-center z-50 w-full pointer-events-none">
        <img src="/heat-logo.png" alt=".HEAT Logo" className="object-contain opacity-90" style={{ filter: 'brightness(0)', height: '17px' }} />
        <div className="hidden [@media(max-height:800px)]:flex flex-col items-center mt-1 w-full scale-90 origin-top">
          <MartianBranding className="items-center text-center" />
        </div>
      </div>

      {showFaceBox && rect && (
        <motion.div
            animate={{
              left: `${rect.left + rect.width / 2}%`,
              top: `${rect.top + rect.height / 2}%`,
              opacity: 1
            }}
            transition={{ type: 'spring', damping: 35, stiffness: 150 }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            <FaceTargetCircle size={Math.max(rect.width, rect.height) * 12} color="#000" levels={micLevels} />
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[8px] text-black uppercase tracking-[0.4em] whitespace-nowrap opacity-60 bg-white/20 px-2 py-0.5 backdrop-blur-sm">
              USER_SCAN_LOCKED // ID: {sheetData.totalEntries}
            </div>
            {/* Minimal corner markers still existing but outside the circle */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-black opacity-20 -translate-x-8 -translate-y-8" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-black opacity-20 translate-x-8 translate-y-8" />
          </motion.div>
      )}

      <div className="flex justify-between items-start">
        <div className="w-auto">
          <div className="flex flex-col gap-0.5 relative">
            <div className="absolute -top-3 left-0">
               <BlinkingIndicator label="DB.SYNC" color="#D1FF00" interval={1200} />
            </div>

            <div className="text-sm opacity-70 tracking-[0.4em] uppercase text-black font-semibold mt-1">HEAT PRODUCTION LOG</div>
            <div className="text-6xl font-black text-black leading-none mt-1">
              DAY {(() => {
                const startDate = new Date('2026-03-08');
                const now = time || new Date();
                const diffTime = Math.max(0, now.getTime() - startDate.getTime());
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                return (10 + diffDays).toString().padStart(3, '0');
              })()}
            </div>
            <div className="block [@media(max-height:800px)]:hidden">
              <MartianBranding />
            </div>
          </div>
        </div>

        <div className="flex-1 flex justify-end">
           <div className="flex flex-col items-end gap-1 text-right text-[15px] font-bold text-black uppercase tracking-[0.2em] leading-relaxed -mt-3">
              <div suppressHydrationWarning className="flex gap-6 tabular-nums">
                <span>{time?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</span>
                <span>
                  {time ? `${time.getFullYear()}/${time.getMonth() + 1}/${time.getDate()}` : ""}
                </span>
              </div>
              <div>
                {env?.location}
              </div>
           </div>
        </div>
      </div>

      <div className="flex justify-start items-end">
        <div className="p-4 w-80">
          <div className="text-left flex flex-col gap-2">
            <div className="flex flex-col items-start gap-1 border-t border-black border-opacity-10 pt-2 uppercase relative">
              <div className="absolute left-0 top-1">
                <BlinkingIndicator label="RX/TX" color="#D1FF00" interval={600} />
              </div>
              <div className="text-[8px] opacity-40 uppercase tracking-widest text-black mt-3">REAL-TIME DB SYNC // AUDIO ACTIVE</div>
              <SmoothWaveVisualizer width={280} height={40} color="#D1FF00" levels={micLevels} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
  return (
    <>
      {renderBaseLayout(isFaceDetected, rectData)}
      <motion.div 
        className="fixed left-12 z-[200] flex flex-col gap-8 pointer-events-none"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-4">
           <ResourceMonitor 
             youtubeQuota={resourceUsage.youtubeQuota} 
             geminiUsage={resourceUsage.geminiUsage} 
             tokenCount={resourceUsage.tokenCount} 
           />
        </div>

        <div className="flex flex-col gap-1 relative z-10 transition-all duration-500">
           <MetricWithCircle 
             title="Production" 
             value={sheetData.totalProduction.toString().padStart(3, '0')} 
             circleLabel="PRD"
             rotationDuration="3s"
             dashArray="80 180"
           />
           <MetricWithCircle 
             title="Artist" 
             value={sheetData.totalArtist} 
             circleLabel="ART" 
             rotationDuration="5s"
             dashArray="140 120"
           />
           <MetricWithCircle 
             title="Tracks" 
             value={sheetData.totalTracks} 
             circleLabel="TRK" 
             rotationDuration="8s"
             dashArray="180 80"
             glowOnUpdate={true}
           />
        </div>
      </motion.div>


      {/* RHS Notifications Area */}
      <motion.div 
        className="fixed right-12 z-[200] flex flex-col pointer-events-none items-end pr-2"
        style={{ top: '140px', maxHeight: '75vh' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {visibleNotifications.slice(0, 5).map(notif => (
            <NotificationPanel 
              key={notif.id} 
              notification={notif} 
              onRemove={(id) => {
                // Instantly update local state for better UX
                setDismissedIds(prevSet => {
                  const next = new Set(prevSet);
                  next.add(id);
                  localStorage.setItem('hud_dismissed_notifications', JSON.stringify(Array.from(next)));
                  return next;
                });
              }}
            />
          ))}
        </AnimatePresence>

        {visibleNotifications.length > 5 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 bg-white/5 backdrop-blur-sm border border-white/10 px-2 py-1 rounded-sm text-[9px] font-black text-white/50 tracking-[0.3em] uppercase flex items-center gap-2 shadow-2xl"
          >
            <div className="w-0.5 h-0.5 rounded-full bg-white/40 animate-pulse" />
            + {visibleNotifications.length - 5} Events IN QUEUE
          </motion.div>
        )}
      </motion.div>


      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-auto bg-white/5 backdrop-blur-[2px]"
          >
            <div className="w-80 backdrop-blur-md border p-6 flex flex-col gap-6 shadow-2xl relative"
                 style={{
                   backgroundColor: guiInverted ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.05)',
                   borderColor: guiInverted ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)'
                 }}>
              <TechBracket position="top-left" size={10} color={guiInverted ? "#fff" : "#000"} />
              <TechBracket position="bottom-right" size={10} color={guiInverted ? "#fff" : "#000"} />
              
              <div className="flex justify-between items-center border-b pb-2"
                   style={{ borderColor: guiInverted ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}>
                <span className={`text-xs font-black tracking-[0.4em] ${guiInverted ? 'text-white' : 'text-black'}`}>SYS.OVERRIDE</span>
                <button onClick={() => setSettingsOpen(false)} 
                        className={`text-[10px] font-mono tracking-widest ${guiInverted ? 'text-white/50 hover:text-white' : 'text-black/50 hover:text-black'}`}>
                  [ CLOSE ]
                </button>
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-black tracking-widest opacity-60 ${guiInverted ? 'text-white' : 'text-black'}`}>GUI_INVERSION</span>
                  <button 
                    onClick={onToggleGuiInvert}
                    className={`text-[9px] font-mono tracking-widest px-2 py-1 border transition-colors ${guiInverted ? 'bg-white text-black border-white' : 'border-black/30 text-black hover:bg-black/5'}`}
                  >
                    {guiInverted ? '[ ACTIVE ]' : '[ INACTIVE ]'}
                  </button>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-black tracking-widest opacity-60 ${guiInverted ? 'text-white' : 'text-black'}`}>CAMERA_CHROMA</span>
                  <button 
                    onClick={onToggleCameraMode}
                    className={`text-[9px] font-mono tracking-widest px-2 py-1 border transition-colors ${cameraMode === 'color' ? (guiInverted ? 'bg-white text-black border-white' : 'bg-black text-white border-black') : (guiInverted ? 'border-white/30 text-white hover:bg-white/10' : 'border-black/30 text-black hover:bg-black/5')}`}
                  >
                    {cameraMode === 'color' ? '[ COLOR ]' : '[ MONO ]'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>

  );
};

export default HUDOverlay;
