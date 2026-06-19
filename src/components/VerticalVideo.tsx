'use client';

import React from 'react';

interface VerticalVideoProps {
  videoId?: string;
}

export const VerticalVideo: React.FC<VerticalVideoProps> = ({
  videoId = 'nE1n6d4-8Dk', // Default placeholder for a Cambodian music Short
}) => {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 flex flex-col items-center transition-all hover:bg-white/[0.07]">
      <div className="w-full flex justify-between items-center mb-6">
        <h3 className="text-[10px] font-black text-white/80 uppercase tracking-[0.4em]">
          Weekly HEAT Shorts
        </h3>
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      </div>

      {/* Smartphone Device Frame */}
      <div className="relative w-full max-w-[270px] aspect-[9/16] rounded-[36px] border-[8px] border-neutral-800 shadow-[0_0_40px_rgba(255,255,255,0.05)] overflow-hidden bg-black group">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-4 bg-neutral-800 rounded-b-xl z-20" />

        {/* Iframe Screen */}
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&loop=1&playlist=${videoId}&controls=0`}
          className="w-full h-full pointer-events-auto border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Weekly HEAT Chart Short"
        />

        {/* Glow effect on hover */}
        <div className="absolute inset-0 border border-white/0 group-hover:border-white/10 rounded-[28px] transition-all duration-500 pointer-events-none" />
      </div>

      <p className="mt-4 text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] text-center">
        Weekly Video Recap / 週間ランキング
      </p>
    </div>
  );
};
