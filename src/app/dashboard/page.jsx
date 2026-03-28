'use client';

import { useState, useEffect } from 'react';
import SidebarLayout from '@/components/SidebarLayout';
import TradingGoalCard from '@/components/TradingGoalCard';
import CognitiveLogCard from '@/components/CognitiveLogCard';
import OrderHistoryCard from '@/components/OrderHistoryCard';
import { Activity, Power, Shield, Loader2, BrainCircuit, ArrowLeftRight, TrendingUp, TrendingDown } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';


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
    walletAssetsValueUsdt: 0,
    marketType: 'MIXED',
    spotAssets: [],
    futureAssets: []
  });
  const [walletTab, setWalletTab] = useState('SPOT');
  const [positions, setPositions] = useState([]);
  const [pnlHistory, setPnlHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const extractMarketTypeFromDirectives = (directives) => {
    const text = String(directives || '');
    const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
    if (marker?.[1]) return marker[1].toUpperCase();
    const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
    if (alt?.[1]) return alt[1].toUpperCase();
    return null;
  };

  const upsertMarketTypeMarker = (directives, nextMarketType) => {
    const safeNext = String(nextMarketType || 'MIXED').toUpperCase();
    const markerLine = `[[MARKET_TYPE=${safeNext}]]`;
    const original = String(directives || '');

    // Remove previous marker lines
    const cleaned = original
      .replace(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]\s*/gi, '')
      .replace(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)\s*/gi, '')
      .trim();

    return cleaned.length > 0 ? `${markerLine}\n${cleaned}` : markerLine;
  };

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
      if (!sRes.ok) console.log('Stats fetch failed status:', sRes.status);
      if (!pRes.ok) console.log('Positions fetch failed status:', pRes.status);

      const sText = await sRes.text();
      const pText = await pRes.text();
      
      console.log('Stats Raw Text Length:', sText.length);
      console.log('Positions Raw Text Length:', pText.length);

      const sData = JSON.parse(sText);
      const pData = JSON.parse(pText);
      
      if (!sData.error) {
        setStats(sData);
        if (typeof sData.currentPnl === 'number' && Number.isFinite(sData.currentPnl)) {
          setPnlHistory((prev) => {
            const next = [...prev, { t: Date.now(), pnl: sData.currentPnl }];
            return next.slice(-40);
          });
        }
      }
      if (Array.isArray(pData)) setPositions(pData);
    } catch (error) {
      console.log('Detailed Dashboard Fetch Error:', error.message || error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBot = async (field, value) => {
    // Confirmation dialogs for critical actions
    let confirmMessage = "";
    if (field === 'isPaperTrading') {
      confirmMessage = value 
        ? "คุณต้องการสลับเป็นโหมดจำลอง (Paper Trading) ใช่หรือไม่?\n(ระบบจะใช้เงินจำลองในการเทรด)" 
        : "คำเตือน! คุณกำลังจะสลับเป็นโหมดเทรดจริง (Live Trading)\nคุณต้องการดำเนินการต่อใช่หรือไม่?";
    } else if (field === 'isActive') {
      confirmMessage = value
        ? "คุณต้องการเริ่มการทำงาน AutoPilot ใช่หรือไม่?"
        : "คุณต้องการหยุดการทำงาน AutoPilot ใช่หรือไม่?";
    } else if (field === 'aiDirectives' && typeof value === 'string' && value.includes('MARKET_TYPE')) {
      const type = value.match(/MARKET_TYPE=(SPOT|FUTURES|MIXED)/i)?.[1];
      confirmMessage = `คุณต้องการสลับโหมดตลาดเป็น ${type} ใช่หรือไม่?`;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

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

  const pnlPrev = pnlHistory.length > 1 ? pnlHistory[pnlHistory.length - 2].pnl : null;
  const pnlDelta = pnlPrev !== null ? stats.currentPnl - pnlPrev : null;
  const pnlIsUp = pnlDelta !== null ? pnlDelta >= 0 : null;

  const derivedMarketType =
    extractMarketTypeFromDirectives(stats.aiDirectives) ||
    stats.marketType ||
    'MIXED';

  return (
    <SidebarLayout>
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white font-thai">แดชบอร์ด</h1>
            <p className="text-slate-500 text-xs font-thai mt-1">
              กำลังรันโหมด: <span className={stats.isPaperTrading ? 'text-amber-500' : 'text-teal-500'}>
                {stats.isPaperTrading ? 'Paper Trading (จำลอง)' : 'Live Trading (จริง)'}
              </span>
            </p>
          </div>

          <button 
            onClick={() => handleToggleBot('isPaperTrading', !stats.isPaperTrading)}
            disabled={isToggling}
            className={`flex items-center gap-2 mt-1 px-4 py-2 rounded-xl font-bold text-xs tracking-wide transition-all border ${
              stats.isPaperTrading 
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20' 
              : 'bg-teal-500/10 text-teal-500 border-teal-500/30 hover:bg-teal-500/20'
            }`}
          >
            <ArrowLeftRight size={14} className="opacity-70" />
            {stats.isPaperTrading ? 'สลับเป็นโหมดจริง' : 'สลับเป็นโหมดจำลอง'}
            <ArrowLeftRight size={14} className="opacity-70" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${stats.connectionStatus === 'CONNECTED' ? 'bg-teal-500' : stats.connectionStatus === 'DISCONNECTED' ? 'bg-red-500' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-thai">
              {stats.connectionStatus === 'CONNECTED' ? 'เชื่อมต่อแล้ว' : stats.connectionStatus === 'DISCONNECTED' ? 'การเชื่อมต่อผิดพลาด' : 'ยังไม่ได้เชื่อมต่อ'}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-thai">ตลาด</span>
            <div className="flex items-center gap-1.5">
              {[
                { id: 'SPOT', label: 'Spot' },
                { id: 'FUTURES', label: 'Future' },
                { id: 'MIXED', label: 'Mixed' }
              ].map((opt) => {
                const active = derivedMarketType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleToggleBot('aiDirectives', upsertMarketTypeMarker(stats.aiDirectives || '', opt.id))}
                    disabled={isToggling}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors border ${
                      active
                        ? 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                        : 'bg-[#0d1425] text-slate-500 border-slate-800 hover:bg-[#0d1425]/80 hover:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            ภาพรวมพอร์ต
          </div>
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

          {/* Wallet Assets Section */}
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            กระเป๋าเงิน
          </div>
          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
              <h2 className="text-xl font-bold text-white font-thai flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                เหรียญในกระเป๋า (Wallet Assets)
              </h2>
              <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                <button
                  onClick={() => setWalletTab('SPOT')}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    walletTab === 'SPOT' 
                    ? 'bg-teal-500 text-slate-900 shadow-[0_0_15px_rgba(20,184,166,0.3)]' 
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  SPOT
                </button>
                <button
                  onClick={() => setWalletTab('FUTURE')}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    walletTab === 'FUTURE' 
                    ? 'bg-amber-500 text-slate-900 shadow-[0_0_15px_rgba(245,158,11,0.3)]' 
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  FUTURE
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
                รวมมูลค่า{walletTab === 'SPOT' ? 'สปอต' : 'ฟิวเจอร์ส'} (USD)
              </div>
              <div className={`text-lg font-mono ${walletTab === 'SPOT' ? 'text-teal-400' : 'text-amber-400'}`}>
                $
                {(() => {
                  const val = walletTab === 'SPOT' ? (stats.spotValueUsdt || 0) : (stats.futureValueUsdt || 0);
                  return Number(val).toLocaleString('en-US', {
                    maximumFractionDigits: 2
                  });
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                const displayAssets = walletTab === 'SPOT' ? (stats.spotAssets || []) : (stats.futureAssets || []);
                return displayAssets.length > 0 ? (
                  displayAssets
                    .filter(a => a.total > 0.0001) // Filter out dust
                    .sort((a, b) => b.total - a.total)
                    .map((asset) => (
                    <div key={asset.coin} className={`bg-slate-900/50 border p-3 rounded-xl flex justify-between items-center group transition-all ${
                      walletTab === 'SPOT' ? 'border-slate-800 hover:border-teal-500/30' : 'border-slate-800 hover:border-amber-500/30'
                    }`}>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{asset.coin}</div>
                        <div className={`text-lg font-mono transition-colors ${walletTab === 'SPOT' ? 'text-slate-300 group-hover:text-teal-400' : 'text-slate-300 group-hover:text-amber-400'}`}>
                          {asset.total % 1 === 0 ? asset.total : asset.total.toFixed(4)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-600 font-thai">พร้อมใช้</div>
                        <div className="text-[11px] font-mono text-slate-400">{asset.free % 1 === 0 ? asset.free : asset.free.toFixed(4)}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-4 py-8 text-center text-slate-600 font-thai text-sm italic border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                    ไม่พบสินทรัพย์ในกระเป๋า {walletTab === 'SPOT' ? 'Spot' : 'Future'}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Portfolio Tranche X-Ray */}
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            Position
          </div>
          <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white font-thai">Positions ที่เปิดอยู่</h2>
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
                    <th className="pb-3 pl-2 font-thai">วันที่ / เวลา</th>
                    <th className="pb-3 font-thai">เหรียญ / คำสั่ง</th>
                    <th className="pb-3 font-thai">สถานะ / P&L</th>
                    <th className="pb-3 font-thai">ราคาเข้า</th>
                    <th className="pb-3 text-right pr-2 font-thai">ประเภท</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 pl-2 font-mono text-[10px] text-slate-500">
                        {new Date(pos.openedAt).toLocaleString('th-TH', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col">
                          <div className="font-bold text-slate-200 text-sm">{pos.symbol}</div>
                          <div className={`text-[10px] uppercase tracking-wider ${
                            pos.symbol.includes(':') 
                              ? (pos.side.toUpperCase() === 'BUY' ? 'text-teal-400' : 'text-rose-400')
                              : 'text-teal-400'
                          }`}>
                            {(() => {
                              const isFutures = pos.symbol.includes(':');
                              if (isFutures) {
                                return pos.side.toUpperCase() === 'BUY' ? 'POSITION LONG' : 'POSITION SHORT';
                              }
                              return `${pos.side.toUpperCase()} / $${pos.remainingAmount.toLocaleString()} USDT`;
                            })()}
                            {pos.symbol.includes(':') && ` / $${pos.remainingAmount.toLocaleString()} USDT`}
                            <span className="text-slate-500 ml-1">
                              ({(pos.remainingAmount / pos.entryPrice).toFixed(4)} {pos.symbol.split('/')[0].split(':')[0]})
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className={`flex items-center gap-1.5 w-max border px-2.5 py-1 rounded text-[10px] font-bold tracking-widest uppercase ${
                            pos.isMatched 
                            ? 'bg-teal-900/20 text-teal-400 border-teal-800/50' 
                            : 'bg-amber-900/20 text-amber-400 border-amber-800/50'
                          }`}>
                            <Shield size={10} /> {pos.isMatched ? 'จับคู่แล้ว' : 'รอมาร์ทชิ่ง'}
                          </span>
                          {pos.pnlPercent !== undefined && (
                            <span className={`text-[11px] font-bold font-mono ${pos.pnlPercent >= 0 ? 'text-teal-500' : 'text-rose-500'}`}>
                              {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-sm text-slate-300">{pos.entryPrice.toLocaleString()}</span>
                          <span className="text-[9px] text-slate-500 font-mono">Cur: {pos.currentPrice?.toLocaleString() || '-'}</span>
                        </div>
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

          {/* Order History */}
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            ประวัติคำสั่ง
          </div>
          <OrderHistoryCard />
        </div>

        {/* Right Column */}
        <div className="space-y-8 lg:border-l lg:border-slate-800 lg:pl-6">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            สรุปกำไร/ขาดทุน
          </div>
          
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-6">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] text-teal-500 uppercase tracking-widest font-bold font-thai">อัตราการเติบโตวันนี้</span>
              <BrainCircuit className="text-teal-500" size={16} />
            </div>
            <div className="flex items-end justify-between gap-4">
              <div className="text-3xl font-light text-teal-400 font-mono">${stats.currentPnl.toLocaleString()}</div>

              <div className={`flex items-center gap-2 text-[11px] font-bold ${
                pnlDelta === null
                  ? 'text-slate-500'
                  : pnlIsUp
                    ? 'text-teal-400'
                    : 'text-rose-400'
              }`}>
                {pnlDelta === null ? null : pnlIsUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {pnlDelta === null ? '-' : `${pnlDelta >= 0 ? '+' : '-'}$${Math.abs(pnlDelta).toFixed(2)}`}
              </div>
            </div>

            <div className="h-12 w-full mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pnlHistory} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <Line
                    type="monotone"
                    dataKey="pnl"
                    stroke={pnlDelta === null ? '#38bdf8' : pnlIsUp ? '#14b8a6' : '#f43f5e'}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#0b1121', border: '1px solid #223044' }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`]}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            เป้าหมาย & คอนฟิก AI
          </div>
          <TradingGoalCard 
            initialValue={stats.aiDirectives} 
            onSave={(val) => handleToggleBot('aiDirectives', val)} 
          />

          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            AI Thought Console
          </div>
          <CognitiveLogCard aiDirectives={stats.aiDirectives} />
        </div>
      </div>
    </SidebarLayout>
  );
}
