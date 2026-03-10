"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface RotatingScannerProps {
  size?: number;
  color?: string;
}

export const RotatingScanner = React.memo(({ size = 120, color = "currentColor" }: RotatingScannerProps) => {
  return (
    <div style={{ width: size, height: size }} className="relative opacity-60">
      <motion.svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      >
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="1" strokeDasharray="10 5" />
        <circle cx="50" cy="50" r="35" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 2" />
      </motion.svg>
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      >
        <path d="M 50 5 A 45 45 0 0 1 95 50" fill="none" stroke={color} strokeWidth="3" />
        <path d="M 50 95 A 45 45 0 0 1 5 50" fill="none" stroke={color} strokeWidth="3" />
      </motion.svg>
    </div>
  );
});

RotatingScanner.displayName = 'RotatingScanner';

interface BarGraphProps {
  width?: number | string;
  height?: number | string;
  bars?: number;
  color?: string;
  heights?: number[]; // Array of values 0-100 to drive bar heights externally
}

export const BarGraph = React.memo(({ width = 100, height = 60, bars = 10, color = "currentColor", heights }: BarGraphProps) => {
  return (
    <div className="flex items-end gap-1 opacity-60" style={{ width, height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-full"
          animate={{
            height: heights ? `${heights[i] ?? 20}%` : [`${Math.random() * 80 + 20}%`, `${Math.random() * 80 + 20}%`, `${Math.random() * 80 + 20}%`]
          }}
          transition={heights ? { type: "tween", duration: 0.1 } : {
            duration: 0.5 + Math.random(),
            repeat: Infinity,
            repeatType: "mirror"
          }}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
});

BarGraph.displayName = 'BarGraph';

interface SmoothWaveVisualizerProps {
  width?: number | string;
  height?: number | string;
  color?: string;
  levels?: number[];
}

export const SmoothWaveVisualizer = React.memo(({ width = 280, height = 50, color = "#000", levels }: SmoothWaveVisualizerProps) => {
  const [mounted, setMounted] = React.useState(false);
  const [phase, setPhase] = React.useState(0);
  const w = typeof width === 'number' ? width : 280;
  const h = typeof height === 'number' ? height : 50;
  
  React.useEffect(() => {
    setMounted(true);
    let frame: number;
    const animate = () => {
      setPhase(p => p + 0.08);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) return <div style={{ width, height }} />;

  const avgLevel = levels ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  // Master amplitude: small "breathing" base + dynamic audio part
  const baseAmplitude = h * 0.2;
  const dynamicAmplitude = (avgLevel / 100) * (h * 0.5);
  const amplitude = baseAmplitude + dynamicAmplitude;

  const generateWavePath = (phaseOffset: number, frequency: number, ampScale: number) => {
    const points = [];
    const step = 3; // Finer steps for smoother lines
    const midY = h / 2;
    
    for (let x = 0; x <= w; x += step) {
      // Bell curve envelope to pin ends to zero
      const envelope = Math.pow(Math.sin((x / w) * Math.PI), 2);
      const y = midY + Math.sin(x * frequency + phase + phaseOffset) * amplitude * ampScale * envelope;
      points.push(`${x},${y}`);
    }
    return `M ${points.join(' L ')}`;
  };

  return (
    <div className="relative opacity-80 overflow-visible" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        {/* We draw 15 layers of thin lines to create that "thread" effect from the image */}
        {Array.from({ length: 15 }).map((_, i) => {
          const shift = i * 0.2;
          const freq = 0.02 + (i * 0.001);
          const opacity = 0.9 - (i * 0.04);
          const scale = 1.0 - (i * 0.03);
          
          return (
            <motion.path
              key={i}
              d={generateWavePath(shift, freq, scale)}
              fill="none"
              stroke={color}
              strokeWidth="0.8"
              opacity={opacity}
              transition={{ type: "tween", ease: "linear" }}
            />
          );
        })}
      </svg>
    </div>
  );
});

SmoothWaveVisualizer.displayName = 'SmoothWaveVisualizer';

export const FaceTargetCircle = React.memo(({ size = 200, color = "#000", levels }: { size?: number | string, color?: string, levels?: number[] }) => {
  const [mounted, setMounted] = React.useState(false);
  const [targetRotate, setTargetRotate] = React.useState(0);
  
  React.useEffect(() => {
    setMounted(true);
    // Periodically pick a new random rotation target to feel "alive"
    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 120; // Rotate up to 60 deg either way
      setTargetRotate(prev => prev + change);
    }, 2000 + Math.random() * 3000);
    
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  return (
    <motion.div 
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center pointer-events-none"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: 1, 
        opacity: 0.4,
        rotate: targetRotate,
      }}
      transition={{
        scale: { type: "spring", damping: 20 },
        opacity: { duration: 0.8 },
        rotate: {
          duration: 3.5,
          ease: "easeInOut"
        }
      }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        {/* Subtle base circle */}
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="0.5" opacity="0.05" />

        {/* Simplified reticle ticks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i * 360) / 60;
          let length = 1;
          let strokeWidth = 0.5;
          let show = false;

          // Audio reactivity for all ticks
          const micIndex = i % (levels?.length || 1);
          const micValue = levels ? levels[micIndex] : 0;
          const audioLength = (micValue / 100) * 15;

          // Only show specific key markers for a cleaner look
          if (i === 0) { // Top
            length = 10 + audioLength * 0.5;
            strokeWidth = 1;
            show = true;
          } else if (i === 15) { // Right
            length = 4 + audioLength;
            strokeWidth = 2;
            show = true;
          } else if (i === 42 || i === 44) { // Bottom-left style
            length = 8 + audioLength * 0.3;
            strokeWidth = 1;
            show = true;
          } else if (i % 5 === 0) { // Every 30 degrees (thin ticks)
            length = 2 + audioLength;
            strokeWidth = 0.5;
            show = true;
          } else if (micValue > 15) { // Dynamic ticks based on sound
            length = audioLength * 0.8;
            strokeWidth = 0.3;
            show = true;
          }

          if (!show) return null;

          return (
            <line 
              key={i}
              x1="50" y1={50 - 45}
              x2="50" y2={50 - 45 - length}
              stroke={color}
              strokeWidth={strokeWidth}
              transform={`rotate(${angle} 50 50)`}
              opacity={micValue > 15 ? (micValue / 100) * 0.8 : 0.6}
            />
          );
        })}

        {/* Minimal center indicators */}
        <line x1="48" y1="50" x2="52" y2="50" stroke={color} strokeWidth="0.5" opacity="0.1" />
        <line x1="50" y1="48" x2="50" y2="52" stroke={color} strokeWidth="0.5" opacity="0.1" />
      </svg>
      
      {/* Very subtle breathing outer glow */}
      <motion.div 
        className="absolute inset-0 border border-black opacity-5 rounded-full"
        animate={{ scale: [1, 1.05, 1], opacity: [0.03, 0.08, 0.03] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
});

FaceTargetCircle.displayName = 'FaceTargetCircle';

interface DotGridProps {
  rows?: number;
  cols?: number;
}

export const DotGrid = React.memo(({ rows = 4, cols = 8 }: DotGridProps) => {
  return (
    <div className="grid gap-1 opacity-40" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: rows * cols }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.05,
          }}
        />
      ))}
    </div>
  );
});

DotGrid.displayName = 'DotGrid';

interface MetricCircleProps {
  label: string;
  size?: number;
  color?: string;
  rotationDuration?: string;
  dashArray?: string;
}

export const MetricCircle = React.memo(({ label, size = 60, color = "#000", rotationDuration = "4s", dashArray = "60 200" }: MetricCircleProps) => {
  const mainChar = label.substring(0, 1).toUpperCase();
  const patternId = `dotPattern-${label.replace(/\s+/g, '-')}`;
  
  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center translate-z-0">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full opacity-50">
        <defs>
          <pattern id={patternId} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.8" fill={color} />
          </pattern>
        </defs>
        <circle cx="50" cy="50" r="42" fill={`url(#${patternId})`} />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="0.5" opacity="0.1" />
      </svg>

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <circle cx="50" cy="50" r="34" fill="none" stroke={color} strokeWidth="1" opacity="0.15" />
      </svg>

      <div className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite]" style={{ animationDuration: rotationDuration }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle 
            cx="50" cy="50" r="42"
            fill="none" 
            stroke={color} 
            strokeWidth="6" 
            strokeLinecap="round"
            strokeDasharray={dashArray}
            className="opacity-80"
          />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center">
        <motion.div 
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="text-xl font-black tracking-tighter"
          style={{ color }}
        >
          {mainChar}
        </motion.div>
      </div>
    </div>
  );
});

MetricCircle.displayName = 'MetricCircle';

interface AnimatedCounterProps {
  value: number | string;
  color?: string;
  glowOnUpdate?: boolean;
}

export const AnimatedCounter = ({ value, color = "#000" }: AnimatedCounterProps) => {
  const digits = value.toString().split("");

  return (
    <div className="flex items-center tabular-nums">
      {digits.map((d, i) => (
        <div key={i} style={{ color }} className="font-black">
          {d}
        </div>
      ))}
    </div>
  );
};

interface TypewriterTextProps {
  text: string;
  delay?: number;
  className?: string;
}

export const TypewriterText = ({ text, delay = 0.05, className = "" }: TypewriterTextProps) => {
  const [displayedText, setDisplayedText] = React.useState("");
  
  React.useEffect(() => {
    let currentIdx = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, currentIdx + 1));
      currentIdx++;
      if (currentIdx >= text.length) clearInterval(interval);
    }, delay * 1000);
    return () => clearInterval(interval);
  }, [text, delay]);

  return (
    <div className={`inline-flex items-center ${className}`}>
      <span>{displayedText}</span>
      <span className="ml-0.5 text-black font-bold animate-pulse">
        _
      </span>
    </div>
  );
};

interface DataStreamProps {
  color?: string;
  opacity?: number;
}

export const DataStream = ({ color = "#000", opacity = 0.08 }: DataStreamProps) => {
  const columns = 3;
  const rows = 15;
  
  const generateHex = () => Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  const generateID = () => `ID_${Math.floor(Math.random() * 9000 + 1000)}`;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex justify-around p-4" style={{ opacity }}>
      {Array.from({ length: columns }).map((_, c) => (
        <motion.div
          key={c}
          className="flex flex-col gap-2 font-mono text-[10px]"
          animate={{ y: [0, -100] }}
          transition={{ duration: 10 + c * 5, repeat: Infinity, ease: "linear" }}
          style={{ color }}
        >
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r}>{r % 2 === 0 ? generateHex() : generateID()}</div>
          ))}
          {Array.from({ length: rows }).map((_, r) => (
            <div key={`dup-${r}`}>{r % 2 === 0 ? generateHex() : generateID()}</div>
          ))}
        </motion.div>
      ))}
    </div>
  );
};

export const ScanlineOverlay = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
    <div className="absolute inset-0 opacity-[0.05]" 
         style={{ backgroundImage: 'linear-gradient(0deg, #000 1px, transparent 1px)', backgroundSize: '100% 4px' }} />
    <motion.div 
      animate={{ y: ['0%', '100%'] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      className="absolute inset-x-0 h-[20%] bg-gradient-to-b from-transparent via-black/5 to-transparent opacity-20"
    />
  </div>
);

export const TechBracket = ({ position = "top-left", size = 12 }: { position?: string, size?: number }) => {
  const styles: any = {
    "top-left": "top-0 left-0 border-t-2 border-l-2",
    "top-right": "top-0 right-0 border-t-2 border-r-2",
    "bottom-left": "bottom-0 left-0 border-b-2 border-l-2",
    "bottom-right": "bottom-0 right-0 border-b-2 border-r-2"
  };
  return <div className={`absolute ${styles[position]} border-black/30`} style={{ width: size, height: size }} />;
};

export const BitStrip = ({ count = 8 }: { count?: number }) => (
  <div className="flex gap-1 opacity-20">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`w-1 h-1 ${Math.random() > 0.5 ? 'bg-black' : 'bg-transparent border border-black/30'}`} />
    ))}
  </div>
);
// --- New Live Activity Components ---

export const BlinkingIndicator = ({ label = "TX/RX", color = "#000", interval = 800 }) => {
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    const blinkInterval = setInterval(() => {
      // Randomize blink slightly for organic feel
      if (Math.random() > 0.2) {
        setIsVisible(v => !v);
      }
    }, interval);
    return () => clearInterval(blinkInterval);
  }, [interval]);

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest" style={{ color }}>
      <div 
        className={`w-1.5 h-1.5 rounded-sm transition-opacity duration-75 ${isVisible ? 'opacity-100' : 'opacity-20'}`} 
        style={{ backgroundColor: color }} 
      />
      <span className={isVisible ? 'opacity-100' : 'opacity-40 transition-opacity duration-75'}>
        [{label}]
      </span>
    </div>
  );
};

export const MillisecondTimer = ({ color = "#000" }) => {
  const [ms, setMs] = React.useState("000");

  React.useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      const currentMs = new Date().getMilliseconds();
      setMs(currentMs.toString().padStart(3, '0'));
      animationFrameId = requestAnimationFrame(updateTime);
    };
    animationFrameId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="flex flex-col items-end">
      <div className="text-[8px] opacity-40 uppercase tracking-widest mb-0.5" style={{ color }}>SYS.UPTIME.MS</div>
      <div className="text-xl font-bold font-mono tracking-tighter w-10 text-right tabular-nums" style={{ color }}>
        {ms}
      </div>
    </div>
  );
};
// --- Notification Panel Component ---

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'expired';
  message: string;
  timestamp: Date;
}

interface NotificationPanelProps {
  notification: NotificationItem;
  onRemove?: (id: string) => void;
}

export const NotificationPanel = ({ notification, onRemove }: NotificationPanelProps) => {
  const getColors = (type: string) => {
    switch (type) {
      case 'error': return { border: 'border-red-500/50', glow: 'bg-red-500/10', text: 'text-red-400' };
      case 'success': return { border: 'border-green-500/50', glow: 'bg-green-500/10', text: 'text-green-400' };
      case 'warning': return { border: 'border-yellow-500/50', glow: 'bg-yellow-500/10', text: 'text-yellow-400' };
      case 'expired': return { border: 'border-purple-500/50', glow: 'bg-purple-500/10', text: 'text-purple-400' };
      default: return { border: 'border-white/20', glow: 'bg-white/5', text: 'text-white/80' };
    }
  };

  const colors = getColors(notification.type);

  const playHoverSound = () => {
    const audio = new Audio('/sound/se01.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  };

  const playDeleteSound = () => {
    const audio = new Audio('/sound/delete.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  };

  return (
    <motion.div
      layout
      onMouseEnter={playHoverSound}
      initial={{ opacity: 0, x: 50, filter: 'blur(10px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: 100, scale: 0.95, filter: 'blur(5px)' }}
      whileHover={{ 
        scale: 1.1, 
        x: -15,
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 50,
        transition: { duration: 0.2, ease: "easeOut" } 
      }}
      onClick={() => {
        playDeleteSound();
        onRemove?.(notification.id);
      }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        layout: { duration: 0.4, type: "spring", stiffness: 200, damping: 25 }
      }}
      // Use Tailwind backdrop-blur for frosted glass effect
      className={`relative w-[300px] p-3 mb-2.5 border backdrop-blur-md bg-black/40 ${colors.border} ${colors.glow} flex flex-col gap-1 overflow-hidden shrink-0 cursor-pointer pointer-events-auto shadow-2xl`}
    >
      <div className="flex justify-between items-center px-1 border-b border-white/5 pb-1.5 mb-1">
        <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${colors.text}`}>
          SYS_EVENT :: {notification.type}
        </div>
        <div suppressHydrationWarning className="text-[10px] opacity-40 font-mono text-white/50">
          {new Date(notification.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>
      <div className="text-[13px] text-white/90 leading-tight px-1 py-0.5">
        {notification.message}
      </div>
      
      {/* Decorative corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/30" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/30" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/30" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/30" />
    </motion.div>
  );
};
// --- Sparkline Trend Graph Component ---

export interface SparklineTrendProps {
  data: number[];
  projectionIndex?: number; // Index where the thick black line stops and thin gray starts
  width?: number;
  height?: number;
  color?: string;
  label?: string;
  value?: string;
  details?: {
    views: number;
    shares: number;
    likes: number;
    comments: number;
  };
}

export const SparklineTrend = ({ 
  data, 
  projectionIndex = Math.floor(data.length * 0.6), 
  width = 280, 
  height = 60, 
  color = "#000", 
  label = "14-DAY ACTIVITY TREND", 
  value = "+12.4%", 
  details 
}: SparklineTrendProps) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted || !data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Helper to generate bezier curves
  const generateCurve = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return "";
    let path = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const xMid = (points[i].x + points[i + 1].x) / 2;
        path += ` C ${xMid},${points[i].y} ${xMid},${points[i + 1].y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return path;
  };

  const getPoints = (arr: number[], offsetIndex: number) => {
    return arr.map((val, i) => {
      const globalIndex = i + offsetIndex;
      const x = (globalIndex / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return { x, y };
    });
  };

  const pastData = data.slice(0, projectionIndex + 1);
  const futureData = data.slice(projectionIndex);

  const pastPoints = getPoints(pastData, 0);
  const futurePoints = getPoints(futureData, projectionIndex);

  const pastLinePath = generateCurve(pastPoints);
  const futureLinePath = generateCurve(futurePoints);

  const pastAreaPath = pastLinePath 
    ? `${pastLinePath} L ${pastPoints[pastPoints.length - 1].x},${height} L 0,${height} Z`
    : "";

  return (
    <div className="flex flex-col w-full font-mono relative group" style={{ width }}>
      <ScanlineOverlay />
      <TechBracket position="top-left" />
      <TechBracket position="top-right" />
      
      <div className="flex justify-between items-end mb-6 pr-2 border-b-2 border-black/20 pb-3 relative z-10">
        <div className="flex flex-col">
          <div className="text-[9px] tracking-[0.4em] opacity-40 font-black mb-1">ANALYSIS_STRM // 0xAF42</div>
          <div className="text-base tracking-[0.2em] font-black text-black uppercase" style={{ color }}>
            <span className="opacity-30 mr-1">[</span>{label}<span className="opacity-30 ml-1">]</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <BitStrip count={12} />
          <div className="text-5xl font-black tracking-tighter tabular-nums text-black mt-1" style={{ color }}>{value}</div>
        </div>
      </div>
      
      <div className="relative mb-6 p-4 bg-white/5 rounded-sm overflow-hidden" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0 overflow-visible z-10">
          {/* Background Vertical Grid Lines */}
          <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.1" />
          <line x1={width * 0.5} y1="0" x2={width * 0.5} y2={height} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.1" />
          <line x1={width * 0.75} y1="0" x2={width * 0.75} y2={height} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.1" />

          {/* Past Area - Filled */}
          {pastAreaPath && <path d={pastAreaPath} fill={color} opacity="0.1" />}

          {/* Future Line - Thin and dim */}
          {futureLinePath && (
            <path
              d={futureLinePath}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              className="opacity-20"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 4"
            />
          )}

          {/* Past Line - Thick and dark */}
          {pastLinePath && (
            <path
              d={pastLinePath}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SCANNING LINE */}
          <motion.line
            animate={{ x: [0, width] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            y1="0"
            y2={height}
            stroke={color}
            strokeWidth="2"
            className="opacity-30"
          />

          {/* Current Value Dot */}
          <circle
            cx={width}
            cy={height - ((data[data.length - 1] - min) / range) * height}
            r="4"
            fill={color}
          />
        </svg>
      </div>

      {details && (
        <div className="flex flex-col w-full mt-4 relative z-10">
          <div className="w-full h-1 bg-black/5 mb-6 flex justify-between">
            <div className="h-full bg-black/40 w-1/3" />
            <div className="text-[8px] -top-5 relative opacity-30 font-black tracking-widest">METRIC_CORRELATION_SYNC</div>
          </div>
          
          <div className="grid grid-cols-4 gap-4 w-full pr-4">
            {Object.entries(details).map(([key, val]: any) => (
              <div key={key} className="flex flex-col gap-1.5 border-l border-black/10 pl-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-black/40 font-black">
                  {key.substring(0,3)}
                </span>
                <span className="text-xl font-mono tracking-tighter font-black text-black">
                  {val.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 text-[8px] opacity-20 font-black tracking-[0.5em]">SYSTEM_STABLE // 00.9s</div>
    </div>
  );
};

// --- Activity Heatmap Component ---

export interface ActivityHeatmapProps {
  days?: number;
  color?: string;
  label?: string;
}

export const ActivityHeatmap = ({ days = 30, color = "#000", label = "ACTIVITY DENSITY" }: ActivityHeatmapProps) => {
  // Generate random activity data for the grid
  const gridData = React.useMemo(() => {
    return Array.from({ length: days }).map(() => Math.random());
  }, [days]);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="text-xs uppercase tracking-[0.2em] font-bold opacity-70" style={{ color }}>{label}</div>
      <div className="flex flex-wrap gap-1">
        {gridData.map((val, i) => {
          // Determine opacity based on random value simulating activity level
          let opacity = 0.05; // Base (empty/low)
          if (val > 0.8) opacity = 0.8;
          else if (val > 0.5) opacity = 0.5;
          else if (val > 0.2) opacity = 0.2;

          return (
            <motion.div
              key={i}
              className="w-4 h-4 rounded-sm"
              style={{ backgroundColor: color, opacity }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity, scale: 1 }}
              transition={{ delay: i * 0.02, duration: 0.5 }}
              whileHover={{ scale: 1.5, opacity: 1, zIndex: 10 }}
            />
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-1 text-[9px] font-mono opacity-50 uppercase tracking-widest" style={{ color }}>
        <span>T-{days} DAYS</span>
        <span>CURRENT SYSTEM TIME</span>
      </div>
    </div>
  );
};

// --- Data Stream Widget Component ---

export interface DataStreamWidgetProps {
  color?: string;
  label?: string;
  countLabel?: string;
  baseCount?: number;
}

export const DataStreamWidget = ({ color = "#000", label = "RAW DB INGEST", countLabel = "TOTAL ENTRIES PROCESSED", baseCount = 14028491 }: DataStreamWidgetProps) => {
  const [giantCount, setGiantCount] = React.useState(baseCount);

  React.useEffect(() => {
    setGiantCount(baseCount);
  }, [baseCount]);

  React.useEffect(() => {
    // Aggressively increment the counter to look active
    const interval = setInterval(() => {
      setGiantCount(prev => prev + Math.floor(Math.random() * 47));
    }, 70);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full h-full border-2 border-opacity-10 p-6 relative overflow-hidden group" style={{ borderColor: color }}>
      <ScanlineOverlay />
      <TechBracket position="top-left" />
      <TechBracket position="top-right" />
      
      <div className="flex justify-between items-center relative z-20">
        <div className="text-[10px] uppercase tracking-[0.3em] font-black text-black bg-white/20 backdrop-blur-[2px] px-2 py-1 rounded-sm shadow-sm" style={{ color }}>
          <span className="opacity-30 mr-1">[</span>{label}<span className="opacity-30 ml-1">]</span>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse opacity-40" />
           <span className="text-[8px] font-black opacity-30 tracking-widest uppercase">STREAM_ACTIVE</span>
        </div>
      </div>
      
      {/* Massive Counter */}
      <div className="flex flex-col relative z-20 my-auto bg-white/80 p-5 backdrop-blur-md rounded-sm shadow-xl border border-black/10 scale-95 origin-left">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[9px] uppercase tracking-[0.2em] text-black font-black opacity-40" style={{ color }}>
            {countLabel}
          </div>
          <BitStrip count={4} />
        </div>
        <div className="text-6xl font-black tracking-tighter tabular-nums text-black leading-none" style={{ color }}>
          {giantCount.toLocaleString()}
        </div>
      </div>

      {/* Falling Data Stream Background - Pushed down to avoid title overlap */}
      <div className="absolute inset-x-0 bottom-0 top-14 pointer-events-none opacity-20 z-0" style={{ maskImage: 'linear-gradient(to bottom, transparent, black 5%, black 85%, transparent)' }}>
         <DataStream color={color} opacity={1} />
      </div>
      <div className="absolute bottom-1 right-2 text-[7px] opacity-10 font-black tracking-[0.4em] uppercase">LINK_STATUS: STABLE_0xFF2A</div>
    </div>
  );
};

// --- Demographics Widget Component ---

export const DemographicsWidget = ({ color = "#000", totalEntries = 0 }: { color?: string, totalEntries?: number }) => {
  // Use totalEntries to add slight variations to the static percentages so they look dynamic
  const baseMale = 58;
  const variance = (totalEntries % 5) / 10;
  const malePercent = (baseMale + variance).toFixed(1);
  const femalePercent = (100 - (baseMale + variance)).toFixed(1);
  return (
    <div className="flex flex-col gap-8 w-full h-full border-2 border-opacity-10 p-8 rounded-sm relative overflow-hidden group" style={{ borderColor: color }}>
      <ScanlineOverlay />
      <TechBracket position="top-left" />
      <TechBracket position="top-right" />
      <div className="absolute inset-0 bg-current opacity-5 pointer-events-none" style={{ color }} />
      
      <div className="flex justify-between items-center border-b border-black/10 pb-2 relative z-10">
        <div className="text-sm uppercase tracking-[0.2em] font-black text-black" style={{ color }}>
          <span className="opacity-30 mr-1">[</span>AUDIENCE DEMOGRAPHICS<span className="opacity-30 ml-1">]</span>
        </div>
        <BitStrip count={6} />
      </div>
      
      <div className="flex flex-col gap-10 relative z-10 mt-2">
        <div className="flex justify-between items-end">
          {/* Gender Breakdown */}
          <div className="flex flex-col w-[45%]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[9px] tracking-[0.3em] text-black font-black opacity-40" style={{ color }}>GNDR_B_DN</span>
              <span className="text-xs font-mono tracking-tighter font-black" style={{ color }}>58 / 42%</span>
            </div>
            <div className="h-1.5 w-full flex bg-black/5">
              <div className="h-full opacity-90" style={{ width: '58%', backgroundColor: color }} />
              <div className="h-full opacity-20" style={{ width: '42%', backgroundColor: color }} />
            </div>
          </div>

          {/* Age breakdown */}
          <div className="flex flex-col w-[45%]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[9px] tracking-[0.3em] text-black font-black opacity-40" style={{ color }}>AGE_18_24</span>
              <span className="text-xs font-mono tracking-tighter font-black" style={{ color }}>42.5%</span>
            </div>
            <div className="h-1.5 w-full bg-black/5">
              <div className="h-full opacity-80" style={{ width: '42.5%', backgroundColor: color }} />
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-end">
          <div className="flex flex-col w-[45%]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[9px] tracking-[0.3em] text-black font-black opacity-40" style={{ color }}>TRFC_SGST</span>
              <span className="text-xs font-mono tracking-tighter font-black" style={{ color }}>64.2%</span>
            </div>
            <div className="h-1.5 w-full bg-black/5">
              <div className="h-full opacity-90" style={{ width: '64.2%', backgroundColor: color }} />
            </div>
          </div>
          
          <div className="flex flex-col w-[45%]">
            <div className="flex justify-between items-end mb-1">
              <span className="text-[9px] tracking-[0.3em] text-black font-black opacity-40" style={{ color }}>AGE_25_34</span>
              <span className="text-xs font-mono tracking-tighter font-black" style={{ color }}>31.8%</span>
            </div>
            <div className="h-1.5 w-full bg-black/5">
              <div className="h-full opacity-50" style={{ width: '31.8%', backgroundColor: color }} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-2 right-2 text-[6px] opacity-10 font-black tracking-widest uppercase italic">Target_Region: Tokyo/Aichi/Osaka</div>
    </div>
  );
};

// --- Regional Data Widget Component ---

export const RegionalDataWidget = ({ color = "#000", totalEntries = 0 }: { color?: string, totalEntries?: number }) => {
  const baseDomestic = 82.4;
  const variance = (totalEntries % 3) / 10;
  const domestic = (baseDomestic + variance).toFixed(1);
  const overseas = (100 - (baseDomestic + variance)).toFixed(1);

  return (
    <div className="flex flex-col justify-between gap-4 w-full h-full border-2 border-opacity-10 p-6 rounded-sm relative overflow-hidden group" style={{ borderColor: color }}>
      <ScanlineOverlay />
      <TechBracket position="top-left" />
      <TechBracket position="bottom-right" />
      <div className="absolute inset-0 bg-current opacity-5 pointer-events-none" style={{ color }} />
      
      <div className="flex justify-between items-center border-b border-black/10 pb-2 relative z-10">
        <div className="text-sm uppercase tracking-[0.2em] font-black text-black" style={{ color }}>
          <span className="opacity-30 mr-1">[</span>REGIONAL REACH<span className="opacity-30 ml-1">]</span>
        </div>
        <BitStrip count={8} />
      </div>

      <div className="flex flex-col gap-6 relative z-10 my-auto">
        <div className="flex items-end justify-between border-l-4 border-black/40 pl-4 py-2 bg-white/5 relative">
          <div className="absolute -left-1 top-0 w-1 h-3 bg-black/60" />
          <div className="flex flex-col">
            <span className="text-[9px] tracking-[0.4em] font-black opacity-40 uppercase">DOMESTIC_LOCAL</span>
            <div className="text-5xl font-black tracking-tighter tabular-nums leading-none mt-1">
              {domestic}<span className="text-xl opacity-30 ml-1 font-mono">%</span>
            </div>
          </div>
          <div className="text-[8px] font-mono font-black opacity-20 text-right uppercase tracking-widest">
            NODE_SYNC_A1<br/>STABLE_LINK
          </div>
        </div>

        <div className="flex items-end justify-between border-l-4 border-black/10 pl-4 py-2 opacity-70">
          <div className="flex flex-col">
            <span className="text-[9px] tracking-[0.4em] font-black opacity-40 uppercase">OVERSEAS_RELAY</span>
            <div className="text-4xl font-black tracking-tighter tabular-nums leading-none mt-1">
              {overseas}<span className="text-xl opacity-30 ml-1 font-mono">%</span>
            </div>
          </div>
          <div className="text-[8px] font-mono font-black opacity-10 text-right uppercase tracking-widest">
            GLOBAL_EXT<br/>RT_PENDING
          </div>
        </div>
      </div>
      <div className="absolute bottom-1 left-2 text-[7px] opacity-20 font-black tracking-[0.6em] uppercase italic">SIGNAL: SAT_X_98.2</div>
    </div>
  );
};
