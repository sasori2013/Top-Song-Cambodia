'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, X, Loader2 } from 'lucide-react';

interface AISearchBarProps {
  onSearch: (results: any[], isSearching: boolean) => void;
  onClear: () => void;
}

export const AISearchBar: React.FC<AISearchBarProps> = ({ onSearch, onClear }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    onSearch([], true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      onSearch(data.results || [], false);
    } catch (error) {
      console.error("Search failed:", error);
      onSearch([], false);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    onClear();
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-12 px-4 relative z-50">
      <form onSubmit={handleSearch} className="relative group">
        {/* Glow Effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#D1FF00]/20 to-white/10 rounded-full blur opacity-50 group-focus-within:opacity-100 transition duration-500" />
        
        <div className="relative flex items-center bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-6 py-4 shadow-2xl">
          <Sparkles className={`w-5 h-5 mr-4 transition-colors ${isSearching ? 'text-[#D1FF00] animate-pulse' : 'text-white/40'}`} />
          
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="AI Search: 'Dance Music', 'Heartbreak', 'Summer vibe'..."
            className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/20 text-sm md:text-base font-medium tracking-wide"
          />

          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={clearSearch}
                className="p-1 hover:bg-white/10 rounded-full transition-colors mr-2"
              >
                <X className="w-4 h-4 text-white/40" />
              </motion.button>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="flex items-center gap-2 bg-white text-black px-6 py-2 rounded-full font-black text-[10px] tracking-widest uppercase hover:bg-[#D1FF00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden relative"
          >
            {isSearching ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              'Search'
            )}
          </button>
        </div>

        {/* AI Insight Label */}
        <div className="absolute -bottom-6 left-6 flex items-center gap-2">
            <span className="text-[8px] font-black text-[#D1FF00] tracking-[0.3em] uppercase opacity-60">
                Semantic Engine Active
            </span>
            <div className="w-1 h-1 rounded-full bg-[#D1FF00] animate-ping" />
        </div>
      </form>
    </div>
  );
};
