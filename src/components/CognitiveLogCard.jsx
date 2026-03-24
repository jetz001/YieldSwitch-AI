'use client';

import { useState, useEffect } from 'react';
import { BrainCircuit, Activity, Clock, ChevronRight } from 'lucide-react';

export default function CognitiveLogCard() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // 5s refresh
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

  const getStepColor = (step) => {
    switch (step) {
      case 'PLAN': return 'text-blue-400';
      case 'IMPLEMENT': return 'text-teal-400';
      case 'TRIGGER': return 'text-amber-400';
      case 'FEEDBACK_RETRY': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 h-[400px] flex items-center justify-center">
        <Activity className="animate-pulse text-slate-700" size={48} />
      </div>
    );
  }

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-2xl flex flex-col h-[400px] overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-[#0b1121]/50">
        <div className="flex items-center gap-2">
            <BrainCircuit className="text-teal-500" size={18} />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-thai">วงจรความคิด AI (Cognitive Cycle)</h3>
        </div>
        <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></div>
            <span className="text-[10px] text-teal-500 font-bold uppercase tracking-tighter">Live Stream</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <Activity className="text-slate-800" size={48} />
            <p className="text-slate-600 text-[10px] font-thai italic">
              ยังไม่มีกิจกรรมในขณะนี้<br/>ระบบจะเริ่มบันทึกเมื่อบอทเริ่มขบวนการคิด
            </p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="group border-l-2 border-slate-800 hover:border-teal-500/50 pl-4 py-1 transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${getStepColor(log.step)} flex items-center gap-1`}>
                  <ChevronRight size={10} /> {log.step}
                </span>
                <span className="text-[9px] text-slate-600 flex items-center gap-1 font-mono">
                  <Clock size={10} /> {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-thai leading-relaxed group-hover:text-white transition-colors whitespace-pre-wrap">
                {log.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
