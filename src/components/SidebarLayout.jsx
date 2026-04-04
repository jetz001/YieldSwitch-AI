"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, Key, Shield, Settings, LogOut, HelpCircle } from 'lucide-react';
import HelpModal from './HelpModal';

export default function SidebarLayout({ children }) {
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);

  const navItems = [
    { name: 'แดชบอร์ด', href: '/dashboard', icon: LayoutDashboard },
    { name: 'จัดการระบบแอดมิน', href: '/admin', icon: Shield },
    { name: 'ตั้งค่า', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="flex bg-[#0b1121] min-h-screen text-slate-300 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-[#111827] flex flex-col justify-between border-r border-slate-800">
        <div>
          <div className="p-6 pt-8 pb-10">
            <h1 className="text-2xl font-bold text-teal-400">YieldSwitch AI</h1>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">The Digital Vault</p>
          </div>
          <nav className="space-y-2 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${isActive ? 'bg-teal-900/30 text-teal-400 border border-teal-800/50' : 'hover:bg-slate-800 text-slate-400'}`}>
                  <Icon size={18} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 space-y-4 mb-4">
          <div className="space-y-2 pt-4 border-t border-slate-800">
            <button 
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors w-full text-left"
            >
              <HelpCircle size={18} /> ช่วยเหลือ
            </button>
            <button className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors w-full text-left">
              <LogOut size={18} /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold text-teal-400">
              {navItems.find(i => i.href === pathname)?.name || 'YieldSwitch AI'}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
              <div className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)] animate-pulse"></div>
              <span className="text-xs text-teal-500 font-medium tracking-wide">สถานะระบบ: ออนไลน์</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700"></div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
        {/* Help Modal */}
        <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      </div>
    </div>
  );
}
