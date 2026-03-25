'use client';

import { useState, useEffect } from 'react';
import { BrainCircuit, Activity, Clock, ChevronRight, Terminal } from 'lucide-react';

export default function CognitiveLogCard() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PLAN');

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/bot/logs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch AI logs');
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'PLAN', label: '1. PLAN (วางแผน)' },
    { id: 'IMPLEMENT', label: '2. IMPLEMENT (ประยุกต์ใช้)' },
    { id: 'TASKCHECK', label: '3. TASK CHECK (ติดตามแผน)' }
  ];

  const filteredLogs = logs.filter(log => {
    if (activeTab === 'PLAN') return log.step === 'PLAN';
    if (activeTab === 'IMPLEMENT') return log.step === 'IMPLEMENT';
    if (activeTab === 'TASKCHECK') return log.step === 'TASK_CHECK' || log.step === 'TRIGGER' || log.step === 'FEEDBACK_RETRY';
    return false;
  });

  return (
    <div className="bg-[#0b1121] border border-slate-800 rounded-2xl flex flex-col h-[500px] overflow-hidden shadow-2xl">
      {/* Console Header */}
      <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-[#0d1425]">
        <div className="flex items-center gap-3">
            <Terminal className="text-teal-500" size={16} />
            <h3 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-[0.2em] font-mono">AI THOUGHT CONSOLE</h3>
        </div>
        <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/20 border border-red-500/40"></div>
            <div className="w-2 h-2 rounded-full bg-amber-500/20 border border-amber-500/40"></div>
            <div className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/40"></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/50 bg-[#0d1425]/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-[10px] font-bold tracking-widest transition-all relative ${
              activeTab === tab.id ? 'text-teal-400 bg-teal-500/5' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-500"></div>
            )}
          </button>
        ))}
      </div>

      {/* Log Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 font-mono scrollbar-hide bg-[#0b1121]">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center opacity-30">
            <Activity size={32} />
            <p className="text-[10px] uppercase tracking-widest">No {activeTab} sequences recorded</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="space-y-2">
              <div className="text-[10px] text-slate-600">[{new Date(log.timestamp).toLocaleTimeString()}]</div>
              <div className="flex gap-3">
                <span className="text-[10px] font-bold text-teal-500 shrink-0">[{log.step}]</span>
                <p className="text-xs text-slate-300 leading-relaxed font-thai whitespace-pre-wrap">
                  {log.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Status */}
      <div className="p-3 border-t border-slate-800/50 bg-[#0d1425] flex items-center gap-2">
        <div className="w-1.5 h-3 bg-teal-500 animate-pulse"></div>
        <span className="text-[9px] font-bold text-teal-800 uppercase tracking-[0.2em] animate-pulse">AI IS THINKING...</span>
      </div>
    </div>
  );
}
