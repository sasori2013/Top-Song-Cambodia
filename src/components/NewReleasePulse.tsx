'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReleaseActivity } from '@/lib/types';

interface NewReleasePulseProps {
  data?: ReleaseActivity;
}

export const NewReleasePulse: React.FC<NewReleasePulseProps> = ({ data }) => {
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');

  if (!data) return null;

  const periods = view === 'weekly' ? data.weekly : data.monthly;
  const current = periods[periods.length - 1]?.count ?? 0;
  const previous = periods[periods.length - 2]?.count ?? 0;
  const delta = current - previous;
  const maxCount = Math.max(...periods.map(p => p.count), 1);

  const isUp = delta > 0;
  const isFlat = delta === 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.5 }}
      className="w-full p-6 md:p-8 border border-white/10 bg-white/5 backdrop-blur-md rounded-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[10px] md:text-[12px] font-black tracking-[0.4em] uppercase text-white/60">
          NEW RELEASES
        </h2>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['weekly', 'monthly'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[8px] font-black tracking-widest uppercase px-3 py-1.5 rounded-md transition-all duration-200 ${
                view === v ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/50'
              }`}
            >
              {v === 'weekly' ? '4 WKS' : '12 MO'}
            </button>
          ))}
        </div>
      </div>

      {/* Big Number + Delta */}
      <div className="flex items-end gap-4 mb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${view}-count`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-5xl font-extralight tabular-nums text-white leading-none"
          >
            {current}
          </motion.div>
        </AnimatePresence>
        <div className="pb-1">
          <div
            className={`text-[11px] font-black ${
              isUp ? 'text-white' : isFlat ? 'text-white/30' : 'text-white/40'
            }`}
          >
            {isUp ? `▲ +${delta}` : isFlat ? '▶ SAME' : `▼ ${Math.abs(delta)}`}
          </div>
          <div className="text-[8px] text-white/20 uppercase tracking-wider font-bold mt-0.5">
            vs {view === 'weekly' ? 'last week' : 'last month'}
          </div>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-2.5"
        >
          {[...periods].reverse().map((p, i) => (
            <div key={`${view}-${i}`} className="flex items-center gap-3">
              <span
                className={`text-[8px] font-black uppercase tracking-wider shrink-0 text-right ${
                  p.isCurrent ? 'text-white/80' : 'text-white/20'
                } ${view === 'weekly' ? 'w-14' : 'w-7'}`}
              >
                {p.label}
              </span>
              <div className="flex-1 h-4 bg-white/5 rounded-sm overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(p.count / maxCount) * 100}%` }}
                  viewport={{ once: false }}
                  transition={{ duration: 0.7, delay: i * 0.04, ease: 'easeOut' }}
                  className={`h-full rounded-sm ${
                    p.isCurrent
                      ? 'bg-gradient-to-r from-white/30 to-white/60'
                      : 'bg-white/15'
                  }`}
                />
              </div>
              <span
                className={`text-[9px] font-mono font-bold w-5 text-right ${
                  p.isCurrent ? 'text-white/70' : 'text-white/25'
                }`}
              >
                {p.count}
              </span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex justify-between items-center border-t border-white/5 pt-4">
        <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em] font-mono">
          RELEASE CADENCE
        </span>
        <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse opacity-50" />
      </div>
    </motion.div>
  );
};
