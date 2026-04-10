'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ShibaMascotContainer({ tradeEvent = null, isVisible = true }) {
  const [shibaState, setShibaState] = useState('idle');

  useEffect(() => {
    if (tradeEvent === 'BUY') {
      setShibaState('buying');
      const timer = setTimeout(() => setShibaState('idle'), 5000);
      return () => clearTimeout(timer);
    } else if (tradeEvent === 'SELL') {
      setShibaState('selling');
      const timer = setTimeout(() => setShibaState('idle'), 5000);
      return () => clearTimeout(timer);
    }
  }, [tradeEvent]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-8 w-44 h-44 z-[10000] pointer-events-none group">
      <div className="w-full h-full pointer-events-auto cursor-pointer relative">
        
        {/* Status Bubble (Optimized for performance) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-md bg-indigo-950/80 text-indigo-100 text-[9px] px-3 py-1.5 rounded-full border border-white/10 font-medium tracking-wide shadow-2xl flex items-center gap-2 whitespace-nowrap">
           <div className={`w-1.5 h-1.5 rounded-full ${shibaState === 'idle' ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400 animate-bounce'}`} />
           <span>SHIBABOT AI: {shibaState.toUpperCase()}</span>
        </div>

        {/* CUSTOM ANIMATED GIF MASCOT (Optimized for RAM/CPU) */}
        <motion.div 
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="w-full h-full will-change-transform" // Hardware acceleration
          style={{ backfaceVisibility: 'hidden' }}
        >
          <img 
            src={`/shiba-main.gif?v=${Date.now()}`} 
            alt="Shiba Animated Mascot"
            className="w-full h-full object-contain filter drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)]"
            loading="eager"
            style={{ willChange: 'transform' }} // Critical for large GIF performance
          />
          
          {/* Subtle Ambient Aura */}
          <div className="absolute inset-8 rounded-full border border-teal-500/5 animate-pulse" />
        </motion.div>
        
        {/* Trade Reaction Overlays */}
        <AnimatePresence>
          {shibaState !== 'idle' && (
            <motion.div 
              initial={{ scale: 0, opacity: 0, y: 0 }}
              animate={{ scale: 1, opacity: 1, y: -20 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute top-10 right-0 z-20"
            >
              <div className={`px-2 py-1 rounded bg-slate-900/90 backdrop-blur-sm border ${shibaState === 'buying' ? 'text-emerald-400 border-emerald-500/50' : 'text-amber-400 border-amber-500/50'} text-[10px] font-bold shadow-xl`}>
                {shibaState === 'buying' ? 'BUYING...' : 'SELLING...'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
