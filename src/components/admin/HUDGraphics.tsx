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

export const DataStream = ({ color = "#000", opacity = 0.05 }: DataStreamProps) => {
  const columns = 3;
  const rows = 15;
  
  const generateHex = () => Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  const generateID = () => `FETCHING_ID: ${Math.floor(Math.random() * 9000 + 1000)}`;

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
}

export const NotificationPanel = ({ notification }: NotificationPanelProps) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, filter: 'blur(4px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      // Use Tailwind backdrop-blur for frosted glass effect
      className={`relative w-80 p-3 mb-3 border backdrop-blur-md bg-black/40 ${colors.border} ${colors.glow} flex flex-col gap-1 overflow-hidden shrink-0`}
    >
      <div className="flex justify-between items-center px-1 border-b border-white/10 pb-1 mb-1">
        <div className={`text-[10px] font-bold uppercase tracking-widest ${colors.text}`}>
          SYS_EVENT :: {notification.type}
        </div>
        <div className="text-[9px] opacity-40 font-mono text-white/60">
          {notification.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>
      <div className="text-sm text-white/90 leading-snug px-1 py-0.5">
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
