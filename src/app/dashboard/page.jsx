'use client';

import { useState, useEffect } from 'react';
import SidebarLayout from '@/components/SidebarLayout';
import TradingGoalCard from '@/components/TradingGoalCard';
import PortfolioSettingsCard from '@/components/PortfolioSettingsCard';
import CognitiveLogCard from '@/components/CognitiveLogCard';
import { Activity, Power, Shield, Loader2, BrainCircuit } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    isAutopilot: false,
    isPaperTrading: true,
    initialCapital: 0,
    extractedCapital: 0,
    riskCapital: 0,
    targetProfit: 0,
    portfolioHealth: 100,
    currentPnl: 0,
  });
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/positions')
      ]);
      const sData = await sRes.json();
      const pData = await pRes.json();
      
      if (!sData.error) setStats(sData);
      if (Array.isArray(pData)) setPositions(pData);
    } catch (error) {
      console.error('Failed to fetch dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBot = async (field, value) => {
    setIsToggling(true);
    try {
      const payload = typeof field === 'object' ? field : { [field]: value };
      const res = await fetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.error === 'API_KEYS_MISSING') {
          alert(errorData.message);
          return;
        }
        throw new Error('Toggle failed');
      }
      
      await fetchDashboardData();
    } catch (error) {
      console.error('Toggle failed');
    } finally {
      setIsToggling(false);
    }
  };

  if (isLoading) {
    return (
      <SidebarLayout>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="animate-spin text-teal-500" size={48} />
        </div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white font-thai">แดชบอร์ด</h1>
          <p className="text-slate-500 text-xs font-thai mt-1">
            กำลังรันโหมด: <span className={stats.isPaperTrading ? 'text-amber-500' : 'text-teal-500'}>
              {stats.isPaperTrading ? 'Paper Trading (จำลอง)' : 'Live Trading (จริง)'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleToggleBot('isPaperTrading', !stats.isPaperTrading)}
            disabled={isToggling}
            className={`px-4 py-2 rounded-lg font-bold text-xs tracking-wide transition-all border ${
              stats.isPaperTrading 
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
              : 'bg-teal-500/10 text-teal-500 border-teal-500/30'
            }`}
          >
            {stats.isPaperTrading ? 'สลับเป็นโหมดจริง' : 'สลับเป็นโหมดจำลอง'}
          </button>

          <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${stats.connectionStatus === 'CONNECTED' ? 'bg-teal-500' : stats.connectionStatus === 'DISCONNECTED' ? 'bg-red-500' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-thai">
              {stats.connectionStatus === 'CONNECTED' ? 'เชื่อมต่อแล้ว' : stats.connectionStatus === 'DISCONNECTED' ? 'การเชื่อมต่อผิดพลาด' : 'ยังไม่ได้เชื่อมต่อ'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${stats.isAutopilot ? 'bg-teal-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-thai">{stats.isAutopilot ? 'ทำงาน' : 'หยุดพัก'}</span>
          </div>

          <button 
            onClick={() => handleToggleBot('isActive', !stats.isAutopilot)}
            disabled={isToggling}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm tracking-wide transition-colors ${
              stats.isAutopilot 
              ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
              : 'bg-teal-500 text-[#0b1121] hover:bg-teal-400'
            }`}
          >
            <Power size={16} />
            {stats.isAutopilot ? 'หยุดออโต้ไพลอต' : 'เริ่มออโต้ไพลอต'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <h2 className="text-2xl font-bold text-white mb-2 font-thai">ระบบป้องกันทุน (The Capital Shield)</h2>
            <p className="text-sm text-slate-400 mb-8 font-thai">แสดงสถานะคุ้มทุนและการดึงกำไรกลับจากการเทรด {stats.isPaperTrading ? '(จำลอง)' : '(จริง)'}</p>
            
            <div className="flex gap-8 items-end border-b border-slate-800 pb-4 mb-4">
              <div className="flex-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1 font-thai">เงินต้นสะสม</span>
                <span className="text-3xl font-light text-slate-300 font-mono">${stats.initialCapital.toLocaleString()}</span>
              </div>
              
              <div className="flex-1">
                <span className="text-[10px] text-teal-500 uppercase tracking-widest font-bold block mb-1 font-thai">ดึงทุนกลับแล้ว (PNL รวม)</span>
                <span className="text-3xl font-light text-teal-400 font-mono">${stats.extractedCapital.toLocaleString()}</span>
              </div>

              <div className="flex-1">
                <span className="text-[10px] text-amber-500 uppercase tracking-widest font-bold block mb-1 font-thai">เงินทุนที่มีความเสี่ยง</span>
                <span className="text-3xl font-light text-amber-500 font-mono">${stats.riskCapital.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Portfolio Tranche X-Ray */}
          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white font-thai">เอกซเรย์พอร์ตลงทุนรายไม้</h2>
              <div className="flex items-center gap-2 text-teal-500 bg-teal-900/20 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase border border-teal-900/50">
                <Activity size={12} /> สุขภาพพอร์ต: {stats.portfolioHealth}%
              </div>
            </div>

            {positions.length === 0 ? (
              <div className="py-20 text-center text-slate-600 font-thai italic">ยังไม่มีไม้เปิดในขณะนี้</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                    <th className="pb-3 pl-2 font-thai">เหรียญ / คำสั่ง</th>
                    <th className="pb-3 font-thai">สถานะ</th>
                    <th className="pb-3 font-thai">ราคาเข้า</th>
                    <th className="pb-3 text-right pr-2 font-thai">ประเภท</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${pos.isPaperTrade ? 'bg-amber-900/30 text-amber-500 border-amber-800/50' : 'bg-teal-900/30 text-teal-500 border-teal-800/50'} flex items-center justify-center font-bold text-xs`}>
                            {pos.symbol[0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-200 text-sm">{pos.symbol}</div>
                            <div className="text-[10px] text-teal-400 uppercase tracking-wider">{pos.side} / {pos.remainingAmount} Coins</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="flex items-center gap-1.5 w-max bg-teal-900/20 text-teal-400 border border-teal-800/50 px-2.5 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
                          <Shield size={10} /> {pos.status}
                        </span>
                      </td>
                      <td className="py-4 font-mono text-sm text-slate-300">
                        {pos.entryPrice.toLocaleString()}
                      </td>
                      <td className="py-4 text-right pr-2">
                        <div className={`font-bold text-[10px] uppercase tracking-widest ${pos.isPaperTrade ? 'text-amber-500' : 'text-teal-500'}`}>
                          {pos.isPaperTrade ? 'Paper Trade' : 'Live Trade'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <PortfolioSettingsCard 
            initialTarget={stats.targetProfit} 
            initialRisk={stats.riskCapital} 
            onSave={(vals) => handleToggleBot(vals)} 
          />
          
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-6">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] text-teal-500 uppercase tracking-widest font-bold font-thai">อัตราการเติบโตวันนี้</span>
              <BrainCircuit className="text-teal-500" size={16} />
            </div>
            <div className="text-3xl font-light text-teal-400 font-mono">${stats.currentPnl.toLocaleString()}</div>
          </div>

          <TradingGoalCard 
            initialValue={stats.aiDirectives} 
            onSave={(val) => handleToggleBot('aiDirectives', val)} 
          />

          <CognitiveLogCard />
        </div>
      </div>
    </SidebarLayout>
  );
}
