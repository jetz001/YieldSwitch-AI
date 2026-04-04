'use client';

import React from 'react';
import { Radio, Info, AlertTriangle, TrendingUp, X } from 'lucide-react';

const FearGreedPanel = ({ data, isLoading, onClose }) => {
  if (isLoading) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded mb-4" />
        <div className="h-24 w-full bg-slate-900 rounded-xl" />
      </div>
    );
  }

  const { value = 50, label = 'NEUTRAL' } = data || {};

  // Calculate percentage (0-100)
  const percentage = Math.min(Math.max(value, 0), 100);

  // X position for the vertical pointer (scale 0-100 to range 20-180 on a 200px wide dial)
  const pointerX = (percentage / 100) * 160 + 20;

  // Determine color for glow and status
  const getValueColor = (val) => {
    if (val <= 25) return '#ef4444'; // Red
    if (val <= 45) return '#f97316'; // Orange
    if (val <= 55) return '#eab308'; // Yellow
    if (val <= 75) return '#14b8a6'; // Teal
    return '#22c55e'; // Green
  };

  const currentColor = getValueColor(value);

  return (
    <div className="bg-[#0b0f1a] border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-600 transition-all duration-500 shadow-2xl">
      {/* Close Button */}
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-10"
          title="ซ่อน"
        >
          <X size={14} />
        </button>
      )}

      {/* Vintage Chassis Decoration */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded bg-slate-900 border border-slate-800 shadow-inner">
             <Radio size={14} className="text-amber-500/70" />
          </div>
          <div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">FEAR & GREED TUNER</h3>
            <div className="flex items-center gap-2">
               <span className="text-xs font-bold text-white font-mono tracking-wider">{label}</span>
               <span className="text-[10px] font-mono text-amber-500/60">[{value}/100]</span>
            </div>
          </div>
        </div>
        <div className="text-[9px] text-slate-600 font-mono italic">STEREO / HI-FI</div>
      </div>

      {/* The Dial Section (Sansui Style) */}
      <div className="relative bg-[#0d1425] border-2 border-slate-900 rounded-md p-4 pt-8 pb-3 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
        {/* Glass Reflection Glow */}
        <div className="absolute inset-x-4 top-0 h-[10px] bg-white/5 blur-sm pointer-events-none rounded-t-lg" />
        
        {/* Horizontal Tuning Scale */}
        <svg viewBox="0 0 200 60" className="w-full">
           <defs>
              <filter id="needleGlow">
                 <feGaussianBlur stdDeviation="1.5" result="blur" />
                 <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
           </defs>

           {/* Backdrop for numbers */}
           <rect x="15" y="0" width="170" height="25" fill="rgba(255,255,255,0.02)" rx="2" />

           {/* Vertical Ticks and Numbers */}
           {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((num) => {
              const x = (num / 100) * 160 + 20;
              const isMajor = num % 20 === 0;
              return (
                 <g key={num}>
                    <line 
                       x1={x} y1="30" x2={x} y2={isMajor ? "45" : "40"} 
                       stroke="#475569" 
                       strokeWidth={isMajor ? "1" : "0.5"} 
                    />
                    {isMajor && (
                       <text 
                          x={x} y="20" 
                          textAnchor="middle" 
                          fill="#94a3b8" 
                          fontSize="10" 
                          fontFamily="serif"
                          fontWeight="bold"
                          className="select-none"
                       >
                          {num}
                       </text>
                    )}
                 </g>
              );
           })}

           {/* Minor Ticks between 0-100 */}
           {Array.from({ length: 51 }).map((_, i) => {
             const num = i * 2;
             if (num % 10 === 0) return null; // Already major/minor
             const x = (num / 100) * 160 + 20;
             return (
               <line 
                 key={num}
                 x1={x} y1="30" x2={x} y2="35" 
                 stroke="#334155" 
                 strokeWidth="0.3" 
               />
             );
           })}

           {/* Base Horizontal Line */}
           <line x1="20" y1="30" x2="180" y2="30" stroke="#475569" strokeWidth="0.5" />

           {/* Labels integrated in scale */}
           <text x="20" y="55" fontSize="6" fill="#ef4444" fontFamily="serif" fontWeight="bold">EXTREME FEAR</text>
           <text x="100" y="55" textAnchor="middle" fontSize="6" fill="#eab308" fontFamily="serif" fontWeight="bold">NEUTRAL</text>
           <text x="180" y="55" textAnchor="end" fontSize="6" fill="#22c55e" fontFamily="serif" fontWeight="bold">EXTREME GREED</text>

           {/* The Sliding Pointer (Red Needle) - Long Vertical Line */}
           <g style={{ transform: `translateX(${pointerX - 100}px)`, transition: 'transform 1.2s cubic-bezier(0.19, 1, 0.22, 1)' }}>
              {/* Vertical Red Line spanning the scale height */}
              <line 
                x1="100" y1="2" 
                x2="100" y2="48" 
                stroke="#ef4444" 
                strokeWidth="2.5" 
                filter="url(#needleGlow)" 
                style={{ opacity: 0.9 }}
              />
              {/* Subtle accent at the top/bottom of the needle */}
              <rect x="98.5" y="0" width="3" height="3" fill="#ef4444" />
              <rect x="98.5" y="47" width="3" height="3" fill="#ef4444" />
           </g>
        </svg>

        {/* Ambient Backlight (Warm White Glow) */}
        <div className="absolute inset-0 bg-amber-100/[0.03] pointer-events-none" />
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[8px] text-slate-600 font-thai tracking-widest uppercase font-bold">
           <span className={value < 50 ? 'text-red-500/80' : 'text-slate-700'}>High Sensitivity</span>
           <span className="w-1 h-1 rounded-full bg-slate-800" />
           <span className={value > 50 ? 'text-green-500/80' : 'text-slate-700'}>Auto Tuning</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-slate-600 italic">
          <Info size={10} />
          Sourced via CFG Index
        </div>
      </div>
      
      {/* Small light indicator */}
      <div className="absolute bottom-6 right-8 flex items-center gap-1.5 opacity-50">
         <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.8)]" />
         <span className="text-[7px] text-slate-600 uppercase font-black tracking-tighter">Signal</span>
      </div>
    </div>
  );
};

export default FearGreedPanel;
