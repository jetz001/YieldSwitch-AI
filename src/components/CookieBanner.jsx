'use client';

import { useState, useEffect } from 'react';

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookie-consent', 'true');
    setShowBanner(false);
    // In production, trigger analytics if needed
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-teal-500/30 p-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-sm text-slate-300">
          <p>
            🍪 เราใช้คุกกี้เพื่อเพิ่มประสิทธิภาพในการใช้งานและระบบรักษาความปลอดภัย 
            โดยการใช้งานเว็บไซต์นี้ต่อ ถือว่าคุณยอมรับใน <span className="text-teal-400 underline cursor-pointer">นโยบายความเป็นส่วนตัว</span> ของเรา
          </p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={acceptCookies}
            className="px-6 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-teal-500/20"
          >
            ยอมรับทั้งหมด
          </button>
        </div>
      </div>
    </div>
  );
}
