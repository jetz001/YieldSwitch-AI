'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Terminal, Shield, Zap, BrainCircuit, Activity, Globe, Lock, Cpu, BarChart3, ChevronRight } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { status, data: session } = useSession();
  const [isEntering, setIsEntering] = useState(false);
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing Protocol...');

  const loadingSteps = [
    { threshold: 0, text: 'Neural Link Established...' },
    { threshold: 20, text: 'Fetching Global Market Liquidity...' },
    { threshold: 40, text: 'Calibrating Gemma-3 Cognitive Engine...' },
    { threshold: 60, text: 'Validating Multi-Exchange Security Guards...' },
    { threshold: 85, text: 'Synchronizing Encrypted Vaults...' },
    { threshold: 95, text: 'Authorized Session Handshake...' },
    { threshold: 100, text: 'Welcome to the Future.' },
  ];

  // Auto-start animation if returning from login with ?boot=true
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('boot') === 'true' && status === 'authenticated') {
      setIsEntering(true);
      // Clean up the URL
      window.history.replaceState({}, '', '/');
    }
  }, [status]);

  useEffect(() => {
    if (!isEntering) return;

    const interval = setInterval(() => {
      setLoadingPercent((prev) => {
        const next = prev + Math.floor(Math.random() * 8) + 2; 
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            router.push('/dashboard');
          }, 800);
          return 100;
        }
        return next;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [isEntering, router]);

  useEffect(() => {
    const currentStep = loadingSteps.slice().reverse().find(step => loadingPercent >= step.threshold);
    if (currentStep) {
      setLoadingText(currentStep.text);
    }
  }, [loadingPercent]);

  const handleEnterClick = () => {
    if (status === 'unauthenticated') {
      // Redirect to login, then back to landing with boot flag
      router.push('/login?callbackUrl=/?boot=true');
    } else {
      setIsEntering(true);
    }
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-[#020617] text-slate-50 overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:60px_60px] opacity-20" />
        
        {/* Animated Orbs */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] bg-teal-500/10 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-1/4 -right-1/4 w-[700px] h-[700px] bg-blue-500/10 rounded-full blur-[150px]" 
        />
      </div>

      <AnimatePresence mode="wait">
        {!isEntering ? (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
            transition={{ duration: 0.8 }}
            className="relative z-10 w-full max-w-6xl px-8 py-20 flex flex-col items-center"
          >
            {/* Nav Header Placeholder */}
            <div className="fixed top-0 left-0 w-full p-8 flex justify-between items-center z-50">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center">
                    <BrainCircuit className="w-5 h-5 text-slate-950" />
                 </div>
                 <span className="font-black tracking-tighter text-xl">YIELD<span className="text-teal-400">SWITCH</span></span>
               </div>
               <div className="flex items-center gap-6">
                 {status === 'authenticated' ? (
                    <button 
                      onClick={() => router.push('/dashboard')}
                      className="px-5 py-2 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-400 text-sm font-medium hover:bg-teal-500/20 transition-all flex items-center gap-2"
                    >
                      <Activity className="w-4 h-4" /> แดชบอร์ด
                    </button>
                 ) : (
                    <button 
                      onClick={() => router.push('/login')}
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      Sign In
                    </button>
                 )}
               </div>
            </div>

            {/* Main Hero */}
            <div className="text-center mb-16">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-[10px] text-teal-400 font-bold tracking-widest uppercase mb-6"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                Next Generation Trading Protocol v2.5
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-6xl md:text-9xl font-black tracking-tighter leading-tight mb-8"
              >
                AUTONOMOUS<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">YIELD ENGINE.</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed mb-12"
              >
                Trade Bitget and Binance with professional-grade AI reasoning. Let our Cognitive dual-loop engine handle the complexity of global markets.
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-center"
              >
                <button
                  onClick={handleEnterClick}
                  className="group relative px-12 py-6 bg-teal-500 text-slate-950 font-black text-xl rounded-full overflow-hidden shadow-[0_0_30px_rgba(20,184,166,0.3)] transition-all hover:scale-105 active:scale-95"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    INITIALIZE SYSTEM <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
                </button>
              </motion.div>
            </div>

            {/* Features Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full">
              {[
                { icon: Globe, label: 'Multi-Exchange', desc: 'Seamlessly switch Binance & Bitget' },
                { icon: Lock, label: 'Vault Security', desc: 'Encrypted API Guard protection' },
                { icon: Cpu, label: 'Cognitive Loop', desc: 'Small-model AI task reasoning' },
                { icon: BarChart3, label: 'Smart Stats', desc: 'Real-time equity tracking' }
              ].map((feat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + (i * 0.1) }}
                  className="p-6 rounded-3xl bg-slate-900/40 border border-slate-800/50 backdrop-blur-xl hover:bg-teal-500/5 transition-colors group"
                >
                  <feat.icon className="w-10 h-10 text-teal-500 mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="font-bold text-lg mb-1 text-slate-200">{feat.label}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          /* Loading / Boot State */
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="z-10 flex flex-col items-center w-full max-w-md px-8"
          >
            <div className="relative mb-12">
               <div className="absolute inset-0 bg-teal-500 rounded-full blur-[40px] opacity-20 animate-pulse" />
               <BrainCircuit className="w-24 h-24 text-teal-400 relative z-10" />
            </div>

            <div className="w-full space-y-6">
              <div className="flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[10px] text-teal-500 font-black tracking-[0.2em] uppercase mb-1">Authorization Layer</span>
                  <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {loadingText}
                  </span>
                </div>
                <span className="text-4xl font-black text-white">{loadingPercent}%</span>
              </div>

              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-teal-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${loadingPercent}%` }}
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 font-mono text-[10px] text-slate-500 space-y-1 overflow-hidden h-24">
                {loadingSteps.map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 transition-colors ${loadingPercent >= s.threshold ? 'text-teal-400' : 'opacity-20'}`}>
                    <span>[{loadingPercent >= s.threshold ? 'OK' : '..'}]</span>
                    <span>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 w-full p-8 flex justify-between items-center z-50 pointer-events-none opacity-30">
        <span className="text-[10px] font-mono tracking-widest uppercase">System Status: Active</span>
        <span className="text-[10px] font-mono tracking-widest uppercase">© 2026 YieldSwitch Protocol</span>
      </footer>
    </main>
  );
}
