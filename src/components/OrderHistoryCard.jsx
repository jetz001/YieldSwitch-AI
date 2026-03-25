'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, Activity, Terminal, AlertTriangle } from 'lucide-react';

function normalizeEntryAction(side) {
  const s = (side || '').toUpperCase();
  if (s === 'BUY' || s === 'LONG') return 'BUY';
  if (s === 'SELL' || s === 'SHORT') return 'SELL';
  return s.includes('BUY') ? 'BUY' : 'SELL';
}

function statusBadge(status) {
  if (status === 'CLOSED') {
    return {
      label: 'CLOSED',
      className: 'bg-teal-900/20 text-teal-400 border-teal-800/50'
    };
  }
  if (status === 'CANCELLED') {
    return {
      label: 'CANCELLED',
      className: 'bg-amber-900/20 text-amber-400 border-amber-800/50'
    };
  }
  return {
    label: status,
    className: 'bg-slate-900/50 text-slate-400 border-slate-800/50'
  };
}

export default function OrderHistoryCard() {
  const [statusFilter, setStatusFilter] = useState('CLOSED'); // CLOSED|CANCELLED|ALL
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRawIds, setExpandedRawIds] = useState([]);

  const tabs = useMemo(
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
        const res = await fetch(`/api/dashboard/order-history?status=${encodeURIComponent(statusFilter)}&limit=60`);
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
  }, [statusFilter]);

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

  return (
    <div className="bg-[#0b1121] border border-slate-800 rounded-2xl flex flex-col h-[420px] overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-[#0d1425]">
        <div className="flex items-center gap-3">
          <Terminal className="text-teal-500" size={16} />
          <div>
            <h2 className="text-[10px] font-extrabold text-slate-300 uppercase tracking-[0.2em] font-mono">
              ORDER HISTORY TERMINAL
            </h2>
            <div className="text-[11px] text-slate-400 font-thai mt-1">
              endpoint: <span className="text-slate-300 font-mono">{endpoint}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <Clock size={16} className="text-slate-400" />
          <div className="w-2 h-2 rounded-full bg-teal-500/20 border border-slate-700/60" />
          <span className="text-[10px] text-slate-500 font-bold font-mono">
            {isLoading ? 'LOADING...' : `rows=${rows.length}`}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/50 bg-[#0d1425]/50">
        {tabs.map((t) => {
          const active = statusFilter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`flex-1 py-3 text-[10px] font-bold tracking-widest transition-all relative ${
                active ? 'text-teal-400 bg-teal-500/5' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
              {active && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-teal-500" />}
            </button>
          );
        })}
      </div>

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

              const entryAction = normalizeEntryAction(r.side);
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
                      <span className="text-[10px] text-slate-400 font-bold">
                        [{r.status}] {openedAtLabel}
                        <span className="text-slate-300 font-mono ml-2">{r.symbol}</span>
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
                    <span className="text-slate-400">Mode:</span> <span className="font-bold text-slate-200 font-mono">{modeLabel}</span>
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

