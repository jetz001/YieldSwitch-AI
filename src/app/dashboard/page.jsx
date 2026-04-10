'use client';

import { useState, useEffect, useRef } from 'react';
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
import { motion, AnimatePresence } from 'framer-motion';
import ShibaMascot from '@/components/ShibaMascot';


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
    growth: true,
    mascot: true
  });
  const [tradeEvent, setTradeEvent] = useState(null);
  const prevPosLength = useRef(0);
  const [selectedSymbol, setSelectedSymbol] = useState('BINANCE:BTCUSDT');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { 
        duration: 0.5,
        ease: "easeOut"
      }
    }
  };

  const cardHover = {
    whileHover: { 
      y: -2, 
      transition: { duration: 0.2, ease: "easeInOut" } 
    },
    whileTap: { scale: 0.99 }
  };

  useEffect(() => {
    const saved = localStorage.getItem('dashboard_layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const defaults = { 
          wallet: true, positions: true, goal: true, console: true, 
          history: true, stats: true, chart: true, sentiment: true, growth: true, 
          mascot: true 
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
    const cleaned = original
      .replace(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]\s*/gi, '')
      .replace(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)\s*/gi, '')
      .trim();
    return cleaned.length > 0 ? `${markerLine}\n${cleaned}` : markerLine;
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [sRes, pRes, sentRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/dashboard/positions'),
        fetch('/api/dashboard/sentiment')
      ]);
      const sData = await sRes.json();
      const pData = await pRes.json();
      const sentData = await sentRes.json();
      
      if (sentData.success) {
        setSentiment({ ...sentData, isLoading: false });
      } else {
        setSentiment(prev => ({ ...prev, isLoading: false }));
      }
      
      if (!sData.error) {
        setStats(sData);
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
      if (Array.isArray(pData)) {
        if (prevPosLength.current > 0) {
          if (pData.length > prevPosLength.current) {
            setTradeEvent('BUY');
            setTimeout(() => setTradeEvent(null), 100); // Pulse event
          } else if (pData.length < prevPosLength.current) {
            setTradeEvent('SELL');
            setTimeout(() => setTradeEvent(null), 100); // Pulse event
          }
        }
        setPositions(pData);
        prevPosLength.current = pData.length;
      }
    } catch (error) {
      console.log('Dashboard Fetch Error:', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBot = async (field, value) => {
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
    if (confirmMessage && !window.confirm(confirmMessage)) return;

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
        alert(errorData.message || 'ไม่สามารถเปลี่ยนสถานะบอทได้');
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
    if (!window.confirm(`คุณต้องการปิด Position ${symbol} ทันที (Market Close) ใช่หรือไม่?`)) return;
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
      alert('ไม่สามารถปิด Position ได้: ' + error.message);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSellAsset = async (coin, amount) => {
    if (!window.confirm(`คุณต้องการขาย ${coin} ทั้งหมด (${amount}) ทันที ใช่หรือไม่?`)) return;
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
  const derivedMarketType = extractMarketTypeFromDirectives(stats.aiDirectives) || stats.marketType || 'MIXED';

  return (
    <SidebarLayout>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white font-thai">แดชบอร์ด</h1>
            <p className="text-slate-500 text-xs font-thai mt-1">
              กำลังรันโหมด: <span className={stats.isPaperTrading ? 'text-amber-500' : 'text-teal-500'}>
                {stats.isPaperTrading ? 'Paper Trading (จำลอง)' : 'Live Trading (จริง)'}
              </span>
            </p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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
          </motion.button>
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
              {['SPOT', 'FUTURES', 'MARGIN', 'MIXED'].map((id) => (
                <motion.button
                  key={id} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => handleToggleBot('aiDirectives', upsertMarketTypeMarker(stats.aiDirectives || '', id))}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors border ${derivedMarketType === id ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' : 'bg-[#0d1425] text-slate-500 border-slate-800 hover:bg-[#0d1425]/80 hover:text-slate-300'}`}
                >
                  {id.charAt(0) + id.slice(1).toLowerCase()}
                </motion.button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${stats.isAutopilot ? 'bg-teal-500 animate-pulse' : 'bg-slate-500'}`}></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-thai">{stats.isAutopilot ? 'กำลังทำงาน' : 'หยุดทำงาน'}</span>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => handleToggleBot('isActive', !stats.isAutopilot)}
            disabled={isToggling}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm tracking-wide transition-colors ${stats.isAutopilot ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' : 'bg-teal-500 text-[#0b1121] hover:bg-teal-400'}`}
          >
            <Power size={16} /> {stats.isAutopilot ? 'หยุดออโต้ไพลอต' : 'เริ่มออโต้ไพลอต'}
          </motion.button>
          <div className="relative">
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setShowLayoutMenu(!showLayoutMenu)} className={`p-2 border rounded-lg transition-all ${showLayoutMenu ? 'bg-teal-500/10 border-teal-500/50 text-teal-400' : 'border-slate-800 text-slate-500 hover:text-white hover:border-slate-700'}`}>
              <Layout size={20} />
            </motion.button>
            <AnimatePresence>
              {showLayoutMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLayoutMenu(false)} />
                  <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="absolute right-0 mt-2 w-56 bg-[#111827] border border-slate-800 rounded-xl shadow-2xl p-3 z-50">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3 px-2">จัดการเลย์เอาต์</div>
                    <div className="space-y-1">
                       {[
                         { id: 'chart', label: 'กราฟราคา (Chart)' },
                         { id: 'stats', label: 'ภาพรวมพอร์ต (Stats)' },
                         { id: 'wallet', label: 'เหรียญในกระเป๋า (Wallet)' },
                         { id: 'positions', label: 'โพสิชันที่เปิดอยู่ (Positions)' },
                         { id: 'goal', label: 'เป้าหมาย & คำสั่ง AI' },
                         { id: 'console', label: 'AI Thought Console' },
                         { id: 'history', label: 'ประวัติการเทรด (History)' },
                         { id: 'sentiment', label: 'ความกลัวและโลภ (Fear & Greed)' },
                         { id: 'growth', label: 'ความเติบโตวันนี้ (Today Growth)' },
                         { id: 'mascot', label: 'Shiba Robot AI (3D)' }
                       ].map(panel => (
                        <button key={panel.id} onClick={() => togglePanel(panel.id)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors group">
                          <span className={`text-xs font-thai ${visiblePanels[panel.id] ? 'text-slate-200 font-bold' : 'text-slate-500'}`}>{panel.label}</span>
                          {visiblePanels[panel.id] ? <Check size={14} className="text-teal-500" /> : <div className="w-3.5 h-3.5 rounded border border-slate-700" />}
                        </button>
                      ))}
                      <div className="h-px bg-slate-800 my-2" />
                      <button onClick={() => { setVisiblePanels({ wallet: true, positions: true, goal: true, console: true, history: true, stats: true, chart: true, sentiment: true, growth: true }); localStorage.setItem('dashboard_layout', JSON.stringify({})); }} className="w-full text-left px-3 py-2 text-[10px] text-slate-500 hover:text-teal-400 uppercase tracking-widest font-bold font-thai">คืนค่าเริ่มต้น</button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={containerVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8">
          {visiblePanels.chart && (
            <motion.div variants={itemVariants}>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center mb-2 px-1">กราฟราคาแบบเน้นความสูง (Focus View) <X size={10} className="cursor-pointer" onClick={() => togglePanel('chart')} /></div>
              <motion.div {...cardHover} className="bg-[#111827] border border-slate-800 rounded-2xl p-4 relative group shadow-lg overflow-hidden">
                <div className="flex items-center justify-between mb-4 px-2">
                   <h2 className="text-xl font-bold text-white font-thai flex items-center gap-2"><Activity size={18} className="text-teal-500" /> Market Chart: <span className="text-teal-400 font-mono">{selectedSymbol.split(':')[1] || selectedSymbol}</span></h2>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0b1121]">
                  <TradingViewChart symbol={selectedSymbol} height={900} />
                </div>
              </motion.div>
            </motion.div>
          )}

          {visiblePanels.stats && (
            <motion.div variants={itemVariants}>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center mb-2 px-1">ภาพรวมพอร์ต <X size={10} className="cursor-pointer" onClick={() => togglePanel('stats')} /></div>
              <motion.div {...cardHover} className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative overflow-hidden group shadow-lg">
                <h2 className="text-2xl font-bold text-white mb-2 font-thai">ระบบป้องกันทุน (The Capital Shield)</h2>
                <div className="flex gap-8 items-end border-b border-slate-800 pb-4 mb-4">
                  <div className="flex-1"><span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-1 font-thai">เงินต้นสะสม</span><span className="text-3xl font-light text-slate-300 font-mono">${stats.initialCapital.toLocaleString()}</span></div>
                  <div className="flex-1"><span className="text-[10px] text-teal-500 uppercase tracking-widest font-bold block mb-1 font-thai">ดึงทุนกลับแล้ว</span><span className="text-3xl font-light text-teal-400 font-mono">${stats.extractedCapital.toLocaleString()}</span></div>
                  <div className="flex-1"><span className="text-[10px] text-amber-500 uppercase tracking-widest font-bold block mb-1 font-thai">เงินทุนเสี่ยง</span><span className="text-3xl font-light text-amber-500 font-mono">${stats.riskCapital.toLocaleString()}</span></div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {visiblePanels.wallet && (
            <motion.div variants={itemVariants}>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center mb-2 px-1">กระเป๋าเงิน <X size={10} className="cursor-pointer" onClick={() => togglePanel('wallet')} /></div>
              <motion.div {...cardHover} className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative group shadow-lg">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                  <h2 className="text-xl font-bold text-white font-thai flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-teal-500"></div>เหรียญในกระเป๋า (Wallet Assets)</h2>
                  <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                    <button onClick={() => setWalletTab('SPOT')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${walletTab === 'SPOT' ? 'bg-teal-500 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>SPOT</button>
                    <button onClick={() => setWalletTab('FUTURE')} className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${walletTab === 'FUTURE' ? 'bg-amber-500 text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>FUTURE</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <AnimatePresence mode="popLayout">
                    {(walletTab === 'SPOT' ? (stats.spotAssets || []) : (stats.futureAssets || []))
                      .filter(a => a.total > 0.0001)
                      .sort((a, b) => b.total - a.total)
                      .map((asset) => (
                        <motion.div layout key={asset.coin} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} whileHover={{ scale: 1.05, y: -2 }} className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl flex justify-between items-center group relative">
                          <div className="flex items-center gap-3">
                            <CoinIcon symbol={asset.coin} size={24} className="opacity-80" />
                            <div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 cursor-pointer hover:text-teal-400" onClick={() => setSelectedSymbol(`BINANCE:${asset.coin}USDT`)}>{asset.coin}</div>
                                <div className="text-lg font-mono text-slate-300">{asset.total < 0.01 ? asset.total.toFixed(6) : asset.total.toFixed(4)}</div>
                            </div>
                          </div>
                        </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}

          {visiblePanels.positions && (
            <motion.div variants={itemVariants}>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-thai flex justify-between items-center mb-2 px-1">โพสิชันที่เปิด <X size={10} className="cursor-pointer" onClick={() => togglePanel('positions')} /></div>
              <motion.div {...cardHover} className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative group shadow-lg">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white font-thai">Positions ที่เปิดอยู่</h2>
                  <div className="flex items-center gap-2 text-teal-500 bg-teal-900/20 px-3 py-1 rounded text-[10px] font-bold border border-teal-900/50">สุขภาพพอร์ต: {stats.portfolioHealth}%</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500 font-bold"><th className="pb-3 pl-2">วันที่/เวลา</th><th className="pb-3">เหรียญ/คำสั่ง</th><th className="pb-3">P&L (%)</th><th className="pb-3 text-right pr-2">จัดการ</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <AnimatePresence>
                        {positions.map((pos) => (
                          <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-4 pl-2 font-mono text-[10px] text-slate-500">{new Date(pos.openedAt).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <CoinIcon symbol={pos.symbol} size={20} />
                                <div className="font-bold text-slate-200 text-sm cursor-pointer hover:text-teal-400" onClick={() => setSelectedSymbol(`BINANCE:${pos.symbol.split('/')[0].split(':')[0]}USDT`)}>{pos.symbol}</div>
                              </div>
                            </td>
                            <td className={`py-4 font-mono font-bold ${pos.pnlPercent >= 0 ? 'text-teal-500' : 'text-rose-500'}`}>{pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent}%</td>
                            <td className="py-4 text-right pr-2">
                              <button onClick={() => handleClosePosition(pos.symbol, pos.side)} className="p-1 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all"><X size={12} /></button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>

        <div className="space-y-8 lg:border-l lg:border-slate-800 lg:pl-6">
          {visiblePanels.sentiment && (
            <motion.div variants={itemVariants}>
              <FearGreedPanel data={sentiment} isLoading={sentiment.isLoading} onClose={() => togglePanel('sentiment')} />
            </motion.div>
          )}

          {visiblePanels.growth && (
            <motion.div variants={itemVariants}>
              <motion.div {...cardHover} className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-6 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-2"><span className="text-[10px] text-teal-500 uppercase tracking-widest font-bold font-thai">Today Growth</span><BrainCircuit size={16} className="text-teal-500" /></div>
                <div className="text-3xl font-light text-teal-400 font-mono">${stats.currentPnl.toLocaleString()}</div>
                <div className={`flex items-center gap-2 text-[11px] font-bold mt-2 ${pnlIsUp ? 'text-teal-400' : 'text-rose-400'}`}>{pnlIsUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />} ${Math.abs(pnlDelta || 0).toFixed(2)}</div>
              </motion.div>
            </motion.div>
          )}

          {visiblePanels.goal && (
            <motion.div variants={itemVariants}>
              <TradingGoalCard initialValue={stats.aiDirectives} onSave={(val) => handleToggleBot('aiDirectives', val)} onClose={() => togglePanel('goal')} />
            </motion.div>
          )}

          {visiblePanels.console && (
            <motion.div variants={itemVariants}>
              <CognitiveLogCard aiDirectives={stats.aiDirectives} onClose={() => togglePanel('console')} />
            </motion.div>
          )}
          
          {visiblePanels.history && (
            <motion.div variants={itemVariants}>
              <OrderHistoryCard marketType={derivedMarketType} onClose={() => togglePanel('history')} />
            </motion.div>
          )}
        </div>
      </motion.div>
      <ShibaMascot isVisible={visiblePanels.mascot} tradeEvent={tradeEvent} />
    </SidebarLayout>
  );
}
