'use client';

import SidebarLayout from '@/components/SidebarLayout';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/users/me', { method: 'DELETE' });
      if (res.ok) {
        alert('บัญชีของคุณถูกลบถาวรแล้ว ระบบกำลังนำคุณออกจากระบบ...');
        signOut({ callbackUrl: '/' });
      } else {
        const err = await res.json();
        alert(`เกิดข้อผิดพลาด: ${err.error}`);
      }
    } catch (error) {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const [apiKeys, setApiKeys] = useState({
    bitgetApiKey: '',
    bitgetApiSecret: '',
    bitgetPassphrase: '',
    aiApiKey: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateKeys = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiKeys)
      });
      if (res.ok) {
        alert('บันทึกข้อมูล API สำเร็จ');
      }
    } catch (error) {
      alert('บันทึกล้มเหลว');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidebarLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">ตั้งค่าบัญชี (Settings)</h1>
        <p className="text-slate-400 mb-8 font-thai">จัดการข้อมูลส่วนบุคคลและความเป็นส่วนตัวตามมาตรฐาน PDPA</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            {/* API Keys Section */}
            <form onSubmit={handleUpdateKeys} className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
              <h2 className="text-xl font-semibold text-white mb-4">การเชื่อมต่อ API (Exchange & AI)</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Bitget API Key</label>
                  <input 
                    type="password" 
                    value={apiKeys.bitgetApiKey}
                    onChange={(e) => setApiKeys({...apiKeys, bitgetApiKey: e.target.value})}
                    placeholder="ป้อน API Key"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Bitget API Secret</label>
                  <input 
                    type="password" 
                    value={apiKeys.bitgetApiSecret}
                    onChange={(e) => setApiKeys({...apiKeys, bitgetApiSecret: e.target.value})}
                    placeholder="ป้อน API Secret"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Bitget Passphrase</label>
                  <input 
                    type="password" 
                    value={apiKeys.bitgetPassphrase}
                    onChange={(e) => setApiKeys({...apiKeys, bitgetPassphrase: e.target.value})}
                    placeholder="ป้อน Passphrase"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <label className="block text-sm text-slate-400 mb-1">AI API Key (Gemini/GPT)</label>
                  <input 
                    type="password" 
                    value={apiKeys.aiApiKey}
                    onChange={(e) => setApiKeys({...apiKeys, aiApiKey: e.target.value})}
                    placeholder="ป้อน AI API Key"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-[#0b1121] font-bold rounded-xl transition-all"
                >
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกการเชื่อมต่อ'}
                </button>
              </div>
            </form>

            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
              <h2 className="text-xl font-semibold text-white mb-4">ข้อมูลผู้ใช้</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">อีเมล</label>
                  <input 
                    type="text" 
                    value={session?.user?.email || ''} 
                    disabled 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Privacy & PDPA Section */}
            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl h-full">
              <h2 className="text-xl font-semibold text-white mb-4">ความเป็นส่วนตัวและข้อมูล (Privacy & Data)</h2>
              <div className="space-y-4">
                <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                  <p className="text-white font-medium">สิทธิ์ในการถูกลืม (Right to be Forgotten)</p>
                  <p className="text-sm text-slate-400 mt-1 mb-4">ลบข้อมูลทั้งหมดรวมถึง API Keys และประวัติการเทรดถาวร การลบนี้เป็นไปตามมาตรฐาน PDPA</p>
                  <button 
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg transition-all"
                  >
                    ลบบัญชีถาวร
                  </button>
                </div>
                <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                  <p className="text-white font-medium">ความปลอดภัยข้อมูล</p>
                  <p className="text-sm text-slate-400 mt-1">
                    API Keys ของคุณจะถูกแสดงผลเป็นรหัสผ่าน (Masked) และจัดเก็บด้วยการเข้ารหัสแบบ AES-256 GCM ที่ฝั่งเซิร์ฟเวอร์
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl max-w-md w-full shadow-2xl shadow-red-500/10 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                <span className="text-3xl text-red-500">⚠️</span>
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-4 font-thai">ยืนยันการลบบัญชี?</h3>
              <p className="text-slate-400 text-center mb-8 font-thai leading-relaxed">
                การดำเนินการนี้จะ <span className="text-red-400 font-bold">ลบข้อมูลทั้งหมดถาวร</span> รวมถึง API Keys และประวัติการเทรด 
                เราไม่สามารถกู้คืนข้อมูลได้เมื่อลบไปแล้ว
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'กำลังลบ...' : 'ลบถาวร'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
