"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { BarGraph, DotGrid, MetricCircle, AnimatedCounter, TypewriterText, BlinkingIndicator, MillisecondTimer, NotificationPanel, NotificationItem } from './HUDGraphics';

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
    <div className="text-xl font-bold leading-none uppercase text-black">
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
}

const MetricWithCircle = ({ title, value, circleLabel, rotationDuration, dashArray, glowOnUpdate = false }: MetricWithCircleProps) => (
  <div className="flex flex-col items-start uppercase">
    <div className="text-sm font-bold text-black tracking-widest mb-2">
      {title.toUpperCase()}
    </div>
    <div className="flex items-center gap-6">
      <MetricCircle 
        label={circleLabel} 
        size={60} 
        color="#000" 
        rotationDuration={rotationDuration} 
        dashArray={dashArray} 
      />
      <div className="text-6xl font-black text-black leading-none uppercase">
        <AnimatedCounter value={value} color="#000" glowOnUpdate={glowOnUpdate} />
      </div>
    </div>
  </div>
);

const MartianBranding = () => (
  <div className="flex flex-col gap-0 border-black mt-4">
    <div className="text-xs font-bold tracking-[0.3em] uppercase text-black mb-1 opacity-70">
      <TypewriterText text="AUTH :: ADMIN" delay={0.03} />
    </div>
    <div className="text-2xl font-black tracking-wider text-black leading-none uppercase">KENICHIRO TAKAMATSU</div>
    <div className="text-[10px] tracking-[0.5em] text-black opacity-60 mt-0.5">FOUNDER OF THE HEAT // ROOT ACCESS GRANTED</div>
  </div>
);

interface HUDOverlayProps {
  faceData: any;
  sheetData: {
    totalProduction: number;
    totalArtist: number;
    totalTracks: number;
    totalEntries: number;
  };
  time: Date;
  env: {
    location: string;
    temp: string;
    coord: string;
  };
}

const HUDOverlay = ({ faceData, sheetData, time, env }: HUDOverlayProps) => {
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [micLevels, setMicLevels] = React.useState<number[]>(Array(20).fill(20));

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
        
        // We want a relatively smooth fft size
        analyzer.fftSize = 64;
        const bufferLength = analyzer.frequencyBinCount; // 32
        dataArray = new Uint8Array(bufferLength);
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyzer);

        const updateLevels = () => {
          analyzer.getByteFrequencyData(dataArray);
          
          // Map the 32 frequency bins to our 20 bars
          // We take the lower/mid frequencies which react more to voice
          const newLevels = Array(20).fill(0).map((_, i) => {
            // Map index (0-19) to dataArray index (0-approx 25)
            const dataIndex = Math.floor((i / 20) * 25);
            // Convert byte value (0-255) to percentage (10-100)
            const val = dataArray[dataIndex];
            const pct = Math.max(10, (val / 255) * 100);
            return pct;
          });

          setMicLevels(newLevels);
          animationFrame = requestAnimationFrame(updateLevels);
        };

        updateLevels();
      } catch (err) {
        console.warn('Microphone access denied or not available:', err);
        // Fallback is already handled by BarGraph default behavior if heights are missing 
        // but we pass random data just to keep it alive if mic fails
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

  // Dummy daily notification summary (what happened yesterday)
  React.useEffect(() => {
    // Generate timestamps for "yesterday"
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const ts1 = new Date(yesterday.setHours(20, 15, 0));
    const ts2 = new Date(yesterday.setHours(19, 30, 0));
    const ts3 = new Date(yesterday.setHours(18, 45, 0));
    const ts4 = new Date(yesterday.setHours(12, 10, 0));
    const ts5 = new Date(yesterday.setHours(9, 5, 0));

    const dailySummaryLogs: NotificationItem[] = [
      { id: 'log1', type: 'success', message: 'FB_POST: Successfully published daily ranking schedule.', timestamp: ts1 },
      { id: 'log2', type: 'info', message: 'System diagnostic cycle complete.', timestamp: ts2 },
      { id: 'log3', type: 'success', message: 'TRACK_ADD: New release detected and indexed.', timestamp: ts3 },
      { id: 'log4', type: 'expired', message: 'TRACK_EXPIRED: 3 entries removed (exceeded 90 days).', timestamp: ts4 },
      { id: 'log5', type: 'warning', message: 'High latency detected during GAS synchronization.', timestamp: ts5 }
    ];

    setNotifications(dailySummaryLogs);
    
    // In the future, this can be updated at midnight (00:00:00) 
    // to fetch the previous day's logs from Google Apps Script.
  }, []);

  const isFaceDetected = faceData && faceData.faceLandmarks && faceData.faceLandmarks.length > 0;
  
  const rectData = isFaceDetected ? {
    width: (Math.max(...faceData.faceLandmarks[0].map((l: any) => l.x)) - Math.min(...faceData.faceLandmarks[0].map((l: any) => l.x))) * 100,
    height: (Math.max(...faceData.faceLandmarks[0].map((l: any) => l.y)) - Math.min(...faceData.faceLandmarks[0].map((l: any) => l.y))) * 100,
    left: Math.min(...faceData.faceLandmarks[0].map((l: any) => l.x)) * 100,
    top: Math.min(...faceData.faceLandmarks[0].map((l: any) => l.y)) * 100
  } : null;

  const renderBaseLayout = (showFaceBox = false, rect: any = null) => (
    <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-12">
      <div className="absolute left-6 top-12 bottom-12 w-0.5 bg-black opacity-80" />
      <div className="absolute right-6 top-12 bottom-12 w-0.5 bg-black opacity-80" />

      <img src="/heat-logo.png" alt=".HEAT Logo" className="absolute left-1/2 -translate-x-1/2 top-12 object-contain z-50 opacity-90" style={{ filter: 'brightness(0)', height: '17px' }} />

      {showFaceBox && rect && (
        <motion.div
            animate={{
              left: `${rect.left}%`,
              top: `${rect.top}%`,
              width: `${rect.width}%`,
              height: `${rect.height}%`,
            }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="absolute opacity-30"
          >
            <div className="absolute -top-5 left-0 text-[8px] text-black uppercase tracking-widest">USER SCAN LOCKED</div>
            <div className="absolute -bottom-5 right-0 text-[8px] text-black uppercase tracking-widest">ENTRIES: {sheetData.totalEntries}</div>
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-black" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-black" />
          </motion.div>
      )}

      <div className="flex justify-between items-start">
        <div className="p-4 w-80">
          <div className="flex flex-col gap-0.5 relative">
            <div className="absolute -top-3 left-0">
               <BlinkingIndicator label="DB.SYNC" color="#000" interval={1200} />
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
            <MartianBranding />
          </div>
        </div>

        <div className="p-4 w-auto text-right min-w-[300px]">
          <div className="flex flex-col gap-2">
            <TelemetryBlock 
              title="System_Time" 
              value={time?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })} 
              sub={time ? `${time.getFullYear()}/${time.getMonth() + 1}/${time.getDate()}` : ""} 
              align="right" 
            />
            <TelemetryBlock title="Location" value={env?.location} align="right" />
          </div>
        </div>
      </div>

      <div className="flex justify-start items-end">
        <div className="p-4 w-80">
          <div className="text-left flex flex-col gap-2">
            <div className="flex flex-col items-start gap-1 border-t border-black border-opacity-10 pt-2 uppercase relative">
              <div className="absolute left-0 top-1">
                <BlinkingIndicator label="RX/TX" color="#000" interval={600} />
              </div>
              <div className="text-[8px] opacity-40 uppercase tracking-widest text-black mt-3">REAL-TIME DB SYNC // AUDIO ACTIVE</div>
              <BarGraph bars={20} height={20} width={280} color="#000" heights={micLevels} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {renderBaseLayout(isFaceDetected, rectData)}
      
      <div 
        className="fixed left-12 z-[200] flex flex-col gap-6 pointer-events-none"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
        <div className="flex flex-col gap-3 relative z-10 transition-all duration-500">
           <MetricWithCircle 
             title="Production" 
             value={sheetData.totalProduction.toString().padStart(3, '0')} 
             circleLabel="PRD"
             rotationDuration="3s"
             dashArray="80 180"
           />
        </div>
        <div className="relative z-10">
          <MetricWithCircle 
            title="Artist" 
            value={sheetData.totalArtist} 
            circleLabel="ART" 
            rotationDuration="5s"
            dashArray="140 120"
          />
        </div>
        <div className="relative z-10">
          <MetricWithCircle 
            title="Tracks" 
            value={sheetData.totalTracks} 
            circleLabel="TRK" 
            rotationDuration="8s"
            dashArray="180 80"
            glowOnUpdate={true}
          />
        </div>
      </div>

      <motion.div 
        className="fixed right-12 bottom-12 z-[200] pointer-events-none text-base font-bold text-black tracking-[0.3em] uppercase opacity-80"
        animate={{ opacity: [0.3, 0.8, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        SYSTEM MONITORING // <span className="opacity-50">TRACKING ACTIVE</span>
      </motion.div>

      {/* RHS Notifications Area */}
      <div 
        className="fixed right-12 z-[200] flex flex-col pointer-events-none"
        style={{ top: '35%', maxHeight: '60vh' }}
      >
        <AnimatePresence>
          {notifications.map(notif => (
            <NotificationPanel key={notif.id} notification={notif} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

export default HUDOverlay;
