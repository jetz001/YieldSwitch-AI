'use client';

import { useState, useEffect } from 'react';
import SidebarLayout from '@/components/SidebarLayout';
import TradingGoalCard from '@/components/TradingGoalCard';
import CognitiveLogCard from '@/components/CognitiveLogCard';
import OrderHistoryCard from '@/components/OrderHistoryCard';
import { Activity, Power, Shield, Loader2, BrainCircuit, ArrowLeftRight, TrendingUp, TrendingDown, Layout, X, Check, Search } from 'lucide-react';
import CoinIcon from '@/components/CoinIcon';
import CoinLink from '@/components/CoinLink';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import TradingViewChart from '@/components/TradingViewChart';
import FearGreedPanel from '@/components/FearGreedPanel';


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
  const [sentiment, setSentiment] = useState({ value: 50, label: 'NEUTRAL', isLoading: true });
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState({
    wallet: true,
    positions: true,
    goal: true,
    console: true,
    history: true,
    stats: true,
    chart: true,
    sentiment: true,
    growth: true
  });
  const [selectedSymbol, setSelectedSymbol] = useState('BINANCE:BTCUSDT');

  useEffect(() => {
    const saved = localStorage.getItem('dashboard_layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure new panels (like sentiment) are added even if not in the old saved layout
        const defaults = { 
          wallet: true, positions: true, goal: true, console: true, 
          history: true, stats: true, chart: true, sentiment: true, growth: true 
        };
        setVisiblePanels({ ...defaults, ...parsed });
      } catch (e) {
        console.error('Failed to load layout');
      }
    }
  }, []);

  const togglePanel = (panel) => {
    setVisiblePanels(prev => {
      const next = { ...prev, [panel]: !prev[panel] };
      localStorage.setItem('dashboard_layout', JSON.stringify(next));
      return next;
    });
  };

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
      const [sRes, pRes, sentRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/positions'),
        fetch('/api/dashboard/sentiment')
      ]);
      if (!sRes.ok) console.log('Stats fetch failed status:', sRes.status);
      if (!pRes.ok) console.log('Positions fetch failed status:', pRes.status);
      if (!sentRes.ok) console.log('Sentiment fetch failed status:', sentRes.status);

      const sText = await sRes.text();
      const pText = await pRes.text();
      const sentText = await sentRes.text();
      
      const sData = JSON.parse(sText);
      const pData = JSON.parse(pText);
      const sentData = JSON.parse(sentText);
      
      if (sentData.success) {
        setSentiment({ ...sentData, isLoading: false });
      } else {
        setSentiment(prev => ({ ...prev, isLoading: false }));
      }
      
      if (!sData.error) {
        setStats(sData);
        
        // Auto-switch wallet tab on first successful load if not yet interacted
        setWalletTab(prev => {
           if (sData.marketType === 'SPOT' || sData.marketType === 'MIXED') return 'SPOT';
           if (sData.marketType === 'FUTURES') return 'FUTURE';
           return prev;
        });

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
        if (errorData.message) {
          alert(errorData.message);
        } else {
          alert(`ไม่สามารถเปลี่ยนสถานะบอทได้: ${errorData.error || 'Unknown Error'}`);
        }
        return;
      }
      
      await fetchDashboardData();
    } catch (error) {
      console.error('Toggle failed');
    } finally {
      setIsToggling(false);
    }
  };

  const handleClosePosition = async (symbol, side) => {
    if (!window.confirm(`คุณต้องการปิด Position ${symbol} ทันที (Market Close) ใช่หรือไม่?`)) {
      return;
    }
    
    setIsToggling(true);
    try {
      const res = await fetch('/api/bot/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, reason: 'MANUAL_CLOSE_DASHBOARD' })
      });
      
      if (!res.ok) throw new Error('Close failed');
      await fetchDashboardData();
    } catch (error) {
      console.error('Close failed');
      alert('ไม่สามารถปิด Position ได้: ' + error.message);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSellAsset = async (coin, amount) => {
    if (!window.confirm(`คุณต้องการขาย ${coin} ทั้งหมด (${amount}) ทันที ใช่หรือไม่?`)) {
      return;
    }
    
    setIsToggling(true);
    try {
      const res = await fetch('/api/bot/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: `${coin}/USDT`, side: 'sell', reason: 'MANUAL_SELL_DASHBOARD' })
      });
      
      if (!res.ok) throw new Error('Sell failed');
      await fetchDashboardData();
    } catch (error) {
      console.error('Sell failed');
      alert('ไม่สามารถขายเหรียญได้: ' + error.message);
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
                { id: 'MARGIN', label: 'Margin' },
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

          <div className="relative">
            <button 
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className={`p-2 border rounded-lg transition-all ${showLayoutMenu ? 'bg-teal-500/10 border-teal-500/50 text-teal-400' : 'border-slate-800 text-slate-500 hover:text-white hover:border-slate-700'}`}
            >
              <Layout size={20} />
            </button>
            {showLayoutMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-[#111827] border border-slate-800 rounded-xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in duration-200">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 px-2">จัดการเลย์เอาต์</div>
                  <div className="space-y-1">
                     {[
                       { id: 'chart', label: 'กราฟราคา (Chart)' },
                       { id: 'stats', label: 'ภาพรวมพอร์ต (Stats)' },
                       { id: 'wallet', label: 'เหรียญในกระเป๋า (Wallet)' },
                       { id: 'positions', label: 'โพสิชันที่เปิด (Positions)' },
                       { id: 'goal', label: 'เป้าหมาย & คำสั่ง AI' },
                       { id: 'console', label: 'AI Thought Console' },
                       { id: 'history', label: 'ประวัติการเทรด (History)' },
                       { id: 'sentiment', label: 'ความกลัวและโลภ (Fear & Greed)' },
                       { id: 'growth', label: 'ความเติบโตวันนี้ (Today Growth)' }
                     ].map(panel => (
                      <button
                        key={panel.id}
                        onClick={() => togglePanel(panel.id)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors group"
                      >
                        <span className={`text-xs font-thai ${visiblePanels[panel.id] ? 'text-slate-200 font-bold' : 'text-slate-500'}`}>{panel.label}</span>
                        {visiblePanels[panel.id] ? <Check size={14} className="text-teal-500" /> : <div className="w-3.5 h-3.5 rounded border border-slate-700" />}
                      </button>
                    ))}
                    <div className="h-px bg-slate-800 my-2" />
                    <button 
                      onClick={() => {
                        const reset = { wallet: true, positions: true, goal: true, console: true, history: true, stats: true, chart: true, sentiment: true };
                        setVisiblePanels(reset);
                        localStorage.setItem('dashboard_layout', JSON.stringify(reset));
                      }}
                      className="w-full text-left px-3 py-2 text-[10px] text-slate-500 hover:text-teal-400 uppercase tracking-widest font-bold"
                    >
                      คืนค่าเริ่มต้น
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-8">
          {visiblePanels.chart && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                กราฟราคา
                <button onClick={() => togglePanel('chart')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 relative group">
                <button 
                  onClick={() => togglePanel('chart')}
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 opacity-0 group-hover:opacity-100 transition-all z-50"
                  title="ซ่อนกราฟ"
                >
                  <X size={14} />
                </button>
                <div className="flex items-center justify-between mb-4 px-2">
                   <h2 className="text-xl font-bold text-white font-thai flex items-center gap-2">
                    <Activity size={18} className="text-teal-500" />
                    Market Chart: <span className="text-teal-400 font-mono">{selectedSymbol.split(':')[1] || selectedSymbol}</span>
                  </h2>
                  <div className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    Sourced by TradingView
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0b1121]">
                  <TradingViewChart symbol={selectedSymbol} height={600} />
                </div>
              </div>
            </>
          )}

          {visiblePanels.stats && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                ภาพรวมพอร์ต
                <button onClick={() => togglePanel('stats')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
                <button 
                  onClick={() => togglePanel('stats')}
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="ซ่อนภาพรวม"
                >
                  <X size={14} />
                </button>
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
            </>
          )}

          {visiblePanels.wallet && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                กระเป๋าเงิน
                <button onClick={() => togglePanel('wallet')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative group">
                <button 
                  onClick={() => togglePanel('wallet')}
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="ซ่อนกระเป๋าเงิน"
                >
                  <X size={14} />
                </button>
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
                        <div key={asset.coin} className={`bg-slate-900/50 border p-3 rounded-xl flex justify-between items-center group transition-all relative ${
                          walletTab === 'SPOT' ? 'border-slate-800 hover:border-teal-500/30' : 'border-slate-800 hover:border-amber-500/30'
                        }`}>
                          {walletTab === 'SPOT' && (
                            <button 
                              onClick={() => handleSellAsset(asset.coin, asset.total)}
                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10 shadow-lg hover:bg-rose-600"
                              title="ขายทั้งหมด"
                            >
                              <X size={10} strokeWidth={3} />
                            </button>
                          )}
                          <div className="flex items-center gap-3">
                            <CoinIcon symbol={asset.coin} size={24} className="opacity-80" />
                            <div>
                              <div 
                                className="cursor-pointer hover:underline decoration-teal-500/50 underline-offset-4"
                                onClick={() => setSelectedSymbol(`BINANCE:${asset.coin}USDT`)}
                              >
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{asset.coin}</div>
                              </div>
                              <div className={`text-lg font-mono transition-colors ${walletTab === 'SPOT' ? 'text-slate-300 group-hover:text-teal-400' : 'text-slate-300 group-hover:text-amber-400'}`}>
                                {asset.total % 1 === 0 ? asset.total : asset.total.toFixed(4)}
                              </div>
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
            </>
          )}

          {visiblePanels.positions && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                Position
                <button onClick={() => togglePanel('positions')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative group">
                <button 
                  onClick={() => togglePanel('positions')}
                  className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 opacity-0 group-hover:opacity-100 transition-all z-10"
                  title="ซ่อนโพสิชัน"
                >
                  <X size={14} />
                </button>
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
                            <div className="flex items-center gap-3">
                              <CoinIcon symbol={pos.symbol} size={20} className="shadow-lg shadow-black/20" />
                              <div className="flex flex-col">
                                <div 
                                  className="cursor-pointer hover:underline decoration-teal-500/50 underline-offset-4"
                                  onClick={() => {
                                    const coin = pos.symbol.split('/')[0].split(':')[0];
                                    setSelectedSymbol(`BINANCE:${coin}USDT`);
                                  }}
                                >
                                  <div className="font-bold text-slate-200 text-sm">{pos.symbol}</div>
                                </div>
                                <div className={`text-[10px] uppercase tracking-wider ${
                                  pos.symbol.includes(':') 
                                    ? (['BUY', 'LONG'].includes(String(pos.side || '').toUpperCase()) ? 'text-teal-400' : 'text-rose-400')
                                    : 'text-teal-400'
                                }`}>
                                  {(() => {
                                    const isFutures = pos.symbol.includes(':');
                                    if (isFutures) {
                                      return ['BUY', 'LONG'].includes(String(pos.side || '').toUpperCase()) ? 'POSITION LONG' : 'POSITION SHORT';
                                    }
                                    return `${pos.side.toUpperCase()} / $${pos.remainingAmount.toLocaleString()} USDT`;
                                  })()}
                                  {pos.symbol.includes(':') && ` / $${pos.remainingAmount.toLocaleString()} USDT`}
                                  <span className="text-slate-500 ml-1">
                                    ({(pos.remainingAmount / pos.entryPrice).toFixed(4)} {pos.symbol.split('/')[0].split(':')[0]})
                                  </span>
                                </div>
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
                            <div className="flex items-center justify-end gap-3">
                              <div className={`font-bold text-[10px] uppercase tracking-widest ${pos.isPaperTrade ? 'text-amber-500' : 'text-teal-500'}`}>
                                {pos.isPaperTrade ? 'Paper Trade' : 'Live Trade'}
                              </div>
                              <button 
                                onClick={() => handleClosePosition(pos.symbol, pos.side)}
                                className="p-1 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"
                                title="ปิด Position (Market)"
                              >
                                <X size={12} strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {visiblePanels.history && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                ประวัติคำสั่ง
                <button onClick={() => togglePanel('history')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <OrderHistoryCard marketType={derivedMarketType} onClose={() => togglePanel('history')} />
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-8 lg:border-l lg:border-slate-800 lg:pl-6">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
            สรุปกำไร/ขาดทุน
          </div>

          {visiblePanels.sentiment && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai">
                ความกลัวและโลภ
              </div>
              <FearGreedPanel 
                data={sentiment} 
                isLoading={sentiment.isLoading} 
                onClose={() => togglePanel('sentiment')}
              />
            </>
          )}
          
          {visiblePanels.growth && (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-6 relative group">
              <button 
                onClick={() => togglePanel('growth')}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 opacity-0 group-hover:opacity-100 transition-all z-10"
                title="ซ่อนความเติบโต"
              >
                <X size={14} />
              </button>
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
                <ResponsiveContainer width="100%" height={48}>
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
          )}

          {visiblePanels.goal && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                เป้าหมาย & คอนฟิก AI
                <button onClick={() => togglePanel('goal')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <TradingGoalCard 
                initialValue={stats.aiDirectives} 
                onSave={(val) => handleToggleBot('aiDirectives', val)} 
                onClose={() => togglePanel('goal')}
              />
            </>
          )}

          {visiblePanels.console && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center group">
                AI Thought Console
                <button onClick={() => togglePanel('console')} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 transition-all hover:text-white" title="ซ่อน">
                  <X size={10} />
                </button>
              </div>
              <CognitiveLogCard aiDirectives={stats.aiDirectives} onClose={() => togglePanel('console')} />
            </>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
