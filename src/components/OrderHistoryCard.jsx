'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, Activity, Terminal, AlertTriangle, X } from 'lucide-react';
import CoinIcon from '@/components/CoinIcon';
import CoinLink from '@/components/CoinLink';

function normalizeEntryAction(side, symbol = '') {
  const s = (side || '').toUpperCase();
  const isFutures = symbol.includes(':');
  if (isFutures) {
    return s === 'BUY' || s === 'LONG' ? 'POSITION LONG' : 'POSITION SHORT';
  }
  if (s === 'BUY' || s === 'LONG') return 'BUY';
  if (s === 'SELL' || s === 'SHORT') return 'SELL';
  return s; // Return the literal side for BORROW, REPAY, etc.
}

export default function OrderHistoryCard({ marketType = 'MIXED', onClose }) {
  const [statusFilter, setStatusFilter] = useState('CLOSED'); // CLOSED|CANCELLED|ALL
  const [category, setCategory] = useState('ORDERS'); // ORDERS|FILLS|FINANCE
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRawIds, setExpandedRawIds] = useState([]);

  const isMargin = marketType === 'MARGIN';

  const categoryTabs = useMemo(() => {
    if (!isMargin) return [{ id: 'ORDERS', label: 'History' }];
    return [
      { id: 'ORDERS', label: 'Orders' },
      { id: 'FILLS', label: 'Fills' },
      { id: 'FINANCE', label: 'Finance' },
    ];
  }, [isMargin]);

  const statusTabs = useMemo(
    () => [
      { id: 'CLOSED', label: 'Closed' },
      { id: 'CANCELLED', label: 'Cancelled' },
      { id: 'ALL', label: 'All' }
    ],
    []
  );

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const query = new URLSearchParams({
          status: statusFilter,
          limit: '60',
          marketType,
          category
        });
        const res = await fetch(`/api/dashboard/order-history?${query.toString()}`);
        if (!res.ok) {
          // Keep UI stable if API fails.
          console.warn('Order history fetch failed status:', res.status);
          return;
        }
        const data = await res.json();
        if (isMounted && Array.isArray(data)) setRows(data);
      } catch (err) {
        console.warn('Order history fetch error:', err?.message || err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    setIsLoading(true);
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [statusFilter, category, marketType]);

  const endpoint = `/api/dashboard/order-history?status=${encodeURIComponent(statusFilter)}&limit=60`;

  const statusDotClass = (status) => {
    if (status === 'CLOSED') return 'bg-teal-500';
    if (status === 'CANCELLED') return 'bg-amber-500';
    return 'bg-slate-500';
  };

  const formatMaybeNum = (v) => {
    if (v === null || v === undefined || v === '') return '-';
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    return n.toLocaleString();
  };

  const truncate = (value, maxLen = 28) => {
    const s = String(value ?? '');
    if (s.length <= maxLen) return s;
    return `${s.slice(0, Math.max(0, maxLen - 3))}...`;
  };

  const formatTime = (value) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const isExpanded = (id) => expandedRawIds.includes(id);
  const toggleRaw = (id) => {
    setExpandedRawIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const showStatusTabs = category === 'ORDERS';

  return (
    <div className="bg-[#0b1121] border border-slate-800 rounded-2xl flex flex-col h-[600px] overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-[#0d1425]">
        <div className="flex items-center gap-3">
          <Terminal className="text-teal-500" size={16} />
          <div>
            <h2 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-[0.2em] font-mono">
              ORDER HISTORY TERMINAL
            </h2>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            <div className="w-2 h-2 rounded-full bg-teal-500/20 border border-slate-700/60" />
            <span className="text-[10px] text-slate-500 font-bold font-mono uppercase">
              {isLoading ? 'LOADING...' : `rows=${rows.length}`}
            </span>
          </div>

          {onClose && (
            <button 
              onClick={onClose}
              className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-white transition-colors border border-transparent hover:border-slate-700"
              title="ซ่อนประวัติคำสั่ง"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Category Tabs (Only if Margin) */}
      {isMargin && (
        <div className="flex border-b border-slate-800/30 bg-[#0d1425]/50 overflow-x-auto whitespace-nowrap scrollbar-hide">
          {categoryTabs.map((t) => {
            const active = category === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCategory(t.id)}
                className={`flex-1 py-4 px-6 text-[11px] font-bold tracking-widest transition-all relative ${
                  active ? 'text-teal-400 bg-teal-500/5' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
                {active && <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Status Tabs (Only if category is Orders) */}
      {showStatusTabs && (
        <div className="flex border-b border-slate-800/50 bg-[#0d1425]/30">
          {statusTabs.map((t) => {
            const active = statusFilter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setStatusFilter(t.id)}
                className={`flex-1 py-3 text-[10px] font-bold tracking-widest transition-all relative ${
                  active ? 'text-teal-300 bg-teal-500/5' : 'text-slate-600 hover:text-slate-400'
                }`}
              >
                {t.label}
                {active && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-400" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 font-mono scrollbar-hide bg-[#0b1121]">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-slate-400">
            <Activity className="animate-spin text-teal-500" size={24} />
            <div className="text-[12px] font-thai">กำลังโหลดข้อมูล...</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center opacity-70">
            <AlertTriangle size={26} className="text-amber-500/80" />
            <div className="text-[12px] font-thai">ยังไม่มีประวัติคำสั่ง</div>
            <div className="text-[10px] text-slate-600 font-thai italic">ลองเปลี่ยนแท็บเป็น “All”</div>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => {
              const openedAtLabel = r.openedAt
                ? formatTime(r.openedAt)
                : '-';

              const entryAction = normalizeEntryAction(r.side, r.symbol);
              const modeLabel = r.isPaperTrade ? 'Paper' : 'Live';
              const pnl = r.pnlPercent;
              const pnlLabel = pnl === null || pnl === undefined ? '-' : `${pnl >= 0 ? '+' : ''}${pnl}%`;
              const entryLabel = formatMaybeNum(r.entryPrice);
              const exitLabel =
                r.status === 'CLOSED'
                  ? formatMaybeNum(r.exitPrice ?? r.entryPrice)
                  : '-';
              const currentLabel = r.status === 'OPEN' ? formatMaybeNum(r.currentPrice) : '-';
              const groupLabel = r.trancheGroupId ? truncate(r.trancheGroupId, 30) : '-';

              return (
                <div key={r.id} className="border border-slate-800/60 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-[#0d1425] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDotClass(r.status)}`} />
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-2">
                        [{r.status}] {openedAtLabel}
                        <div className="flex items-center gap-1.5 bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-700/30">
                          <CoinIcon symbol={r.symbol} size={14} />
                          <CoinLink symbol={r.symbol} marketType={marketType}>
                            <span className="text-slate-200 font-mono">{r.symbol}</span>
                          </CoinLink>
                        </div>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-600 whitespace-nowrap">
                        PnL%:
                        <span className={pnl === null || pnl === undefined ? 'text-slate-500' : pnl >= 0 ? 'text-teal-400' : 'text-rose-400'}>{pnlLabel}</span>
                      </span>

                      <button
                        onClick={() => toggleRaw(r.id)}
                        className="px-2 py-1 rounded-lg border border-slate-700/60 bg-slate-900/40 hover:bg-slate-900/60 text-slate-200 font-bold text-[10px] whitespace-nowrap"
                      >
                        {isExpanded(r.id) ? 'Hide raw' : 'Show raw'}
                      </button>
                    </div>
                  </div>

                  <div className="px-3 py-2 bg-[#0b1121] text-[10px] text-slate-200 whitespace-nowrap overflow-x-auto">
                    <span className="text-slate-400">Mode:</span>{' '}
                    <span className={`font-bold font-mono ${
                      r.tradeMode === 'SHADOW' ? 'text-purple-400' :
                      r.tradeMode === 'DEMO' ? 'text-amber-500' : 
                      'text-teal-500'
                    }`}>
                      {r.tradeMode ?? modeLabel}
                    </span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Side:</span> <span className="font-bold text-slate-200 font-mono">{entryAction}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Sector:</span> <span className="font-mono">{r.sector || 'OTHER'}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Entry:</span> <span className="font-mono">{entryLabel}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Exit:</span> <span className="font-mono">{exitLabel}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Current:</span> <span className="font-mono">{currentLabel}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Original:</span> <span className="font-mono">{formatMaybeNum(r.originalAmount)}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Remaining:</span> <span className="font-mono">{formatMaybeNum(r.remainingAmount)}</span>
                    <span className="mx-2 text-slate-700">|</span>
                    <span className="text-slate-400">Group:</span> <span className="font-mono text-slate-300">{groupLabel}</span>
                  </div>

                  {isExpanded(r.id) ? (
                    <pre className="p-2 rounded-none border-t border-slate-800/70 text-[10px] text-slate-200 whitespace-pre-wrap break-all leading-relaxed bg-slate-900/30">
                      {JSON.stringify(r, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

