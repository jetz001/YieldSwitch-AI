'use client';

import SidebarLayout from '@/components/SidebarLayout';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { 
  Shield, Eye, RefreshCw, Lock, HardDrive, CheckCircle, 
  AlertCircle, Zap, User, Key, Trash2, Settings 
} from 'lucide-react';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('api-vault'); // Default to API Vault as it's the requested move
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // API Vault States
  const [testingAi, setTestingAi] = useState(false);
  const [testingBitget, setTestingBitget] = useState(false);
  const [status, setStatus] = useState({ ai: 'pending', bitget: 'pending' });

  const [form, setForm] = useState({
    bitgetApiKey: '',
    bitgetApiSecret: '',
    bitgetPassphrase: '',
    bitgetDemoApiKey: '',
    bitgetDemoApiSecret: '',
    bitgetDemoPassphrase: '',
    aiApiKey: '',
    aiProvider: 'OPENAI',
    aiModel: 'gpt-4o'
  });

  const [showAiKey, setShowAiKey] = useState(false);
  const [showBitgetKeys, setShowBitgetKeys] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showDemoKeys, setShowDemoKeys] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/users/me');
      const data = await res.json();
      if (res.ok) {
        setForm(prev => ({ ...prev, ...data }));
        if (data.aiApiKey) setStatus(s => ({ ...s, ai: 'verified' }));
        if (data.bitgetApiKey) setStatus(s => ({ ...s, bitget: 'verified' }));
      }
    } catch (e) {
      console.error('Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        alert('บันทึกข้อมูลเรียบร้อยแล้ว');
        fetchConfig();
      }
    } catch (e) {
      alert('บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

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

  const testAi = async () => {
    setTestingAi(true);
    setStatus(s => ({ ...s, ai: 'testing' }));
    try {
      const res = await fetch('/api/test/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          aiApiKey: form.aiApiKey, 
          aiProvider: form.aiProvider, 
          aiModel: form.aiModel 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(s => ({ ...s, ai: 'verified' }));
        alert(data.message);
      } else {
        setStatus(s => ({ ...s, ai: 'failed' }));
        alert(`AI Verification Failed: ${data.message}`);
      }
    } catch (e) {
      alert('AI Connection Error');
      setStatus(s => ({ ...s, ai: 'failed' }));
    } finally {
      setTestingAi(false);
    }
  };

  const testBitget = async (isDemo = false) => {
    setTestingBitget(true);
    setStatus(s => ({ ...s, bitget: 'testing' }));
    try {
      const payload = isDemo ? {
        bitgetDemoApiKey: form.bitgetDemoApiKey,
        bitgetDemoApiSecret: form.bitgetDemoApiSecret,
        bitgetDemoPassphrase: form.bitgetDemoPassphrase,
        isDemo: true
      } : {
        bitgetApiKey: form.bitgetApiKey,
        bitgetApiSecret: form.bitgetApiSecret,
        bitgetPassphrase: form.bitgetPassphrase,
        isDemo: false
      };

      const res = await fetch('/api/test/bitget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(s => ({ ...s, bitget: 'verified' }));
        alert(`${isDemo ? 'DEMO' : 'LIVE'} ${data.message}\nยอดเงินปัจจุบัน: ${data.balance} USDT`);
      } else {
        setStatus(s => ({ ...s, bitget: 'failed' }));
        alert(data.message);
      }
    } catch (e) {
      alert('Bitget Connection Error');
      setStatus(s => ({ ...s, bitget: 'failed' }));
    } finally {
      setTestingBitget(false);
    }
  };

  if (loading) return <SidebarLayout><div className="p-8 text-white font-thai italic animate-pulse">กำลังโหลดข้อมูลระบบส่วนตัว...</div></SidebarLayout>;

  return (
    <SidebarLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight flex items-center gap-3">
            <Settings className="text-teal-400" size={32} />
            การตั้งค่าและระบบนิรภัย
          </h1>
          <p className="text-slate-400 font-thai text-lg">จัดการความปลอดภัย ข้อมูลส่วนบุคคล และคลังกุญแจ API ของคุณ</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-2xl mb-8 w-fit">
          <button 
            onClick={() => setActiveTab('api-vault')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'api-vault' ? 'bg-teal-500 text-[#0b1121] shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <Key size={18} />
            คลัง API (Vault)
          </button>
          <button 
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'account' ? 'bg-teal-500 text-[#0b1121] shadow-lg shadow-teal-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            <User size={18} />
            จัดการบัญชี
          </button>
        </div>

        {activeTab === 'api-vault' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* API Vault Content */}
            <div className="flex gap-4 mb-8">
              <div className="flex items-center gap-2 bg-green-900/30 text-green-400 border border-green-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
                <Shield size={14} /> เข้ารหัส AES-256 แบบปกปิดสมบูรณ์
              </div>
              <div className="flex items-center gap-2 bg-blue-900/30 text-blue-400 border border-blue-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
                <HardDrive size={14} /> ทำงานบน RAM ชั่วคราว (Zero-Log)
              </div>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Main Bitget Column */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Live Trading Section */}
                <div className="bg-[#111827] border border-teal-500/30 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-1 bg-teal-500/50"></div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1 font-thai">ตั้งค่าบัญชีจริง (Live Trading)</h2>
                      <p className="text-xs text-teal-500 italic font-thai uppercase tracking-tighter">Bitget V2 - Main Account Credentials</p>
                    </div>
                    <div className="bg-teal-500/10 text-teal-400 text-[10px] uppercase px-3 py-1 rounded-full font-bold border border-teal-500/30 flex items-center gap-1">
                      <Zap size={10} /> แนะนำสำหรับการรันจริง
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Live API Key</label>
                      <div className="relative">
                        <input 
                          type={showBitgetKeys ? "text" : "password"}
                          value={form.bitgetApiKey}
                          onChange={e => setForm({...form, bitgetApiKey: e.target.value})}
                          className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500 pr-10"
                        />
                        <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showBitgetKeys ? 'text-teal-400' : 'text-slate-600'}`} size={16} onClick={() => setShowBitgetKeys(!showBitgetKeys)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Live Secret Key</label>
                      <div className="relative">
                        <input 
                          type={showBitgetKeys ? "text" : "password"}
                          value={form.bitgetApiSecret}
                          onChange={e => setForm({...form, bitgetApiSecret: e.target.value})}
                          className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500 pr-10"
                        />
                        <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showBitgetKeys ? 'text-teal-400' : 'text-slate-600'}`} size={16} onClick={() => setShowBitgetKeys(!showBitgetKeys)} />
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Live Passphrase</label>
                    <div className="relative">
                      <input 
                        type={showPassphrase ? "text" : "password"}
                        value={form.bitgetPassphrase}
                        onChange={e => setForm({...form, bitgetPassphrase: e.target.value})}
                        className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500 pr-10"
                      />
                      <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showPassphrase ? 'text-teal-400' : 'text-slate-600'}`} size={16} onClick={() => setShowPassphrase(!showPassphrase)} />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      type="button" onClick={() => testBitget(false)} disabled={testingBitget}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 transition-all border border-slate-700/50"
                    >
                      {testingBitget ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      ทดสอบบัญชีจริง
                    </button>
                    <button 
                      type="button" onClick={() => testBitget(true)} disabled={testingBitget}
                      className="flex-1 py-3 bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 rounded-xl text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 transition-all border border-orange-800/30"
                    >
                      {testingBitget ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      ทดสอบ Demo
                    </button>
                  </div>
                </div>

                {/* Native Demo Trading Section */}
                <div className="bg-[#111827] border border-orange-500/20 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-1 bg-orange-500/30"></div>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1 font-thai text-orange-400">โหมดจำลองจริง (Bitget Demo)</h2>
                      <p className="text-[10px] text-slate-500 italic font-thai uppercase tracking-tighter">Real-Market Virtual Environment Support</p>
                    </div>
                    <div className="bg-orange-500/10 text-orange-400 text-[10px] uppercase px-3 py-1 rounded-full font-bold border border-orange-500/20">
                      Paper Trading V2
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Demo API Key</label>
                      <div className="relative">
                        <input 
                          type={showDemoKeys ? "text" : "password"}
                          value={form.bitgetDemoApiKey}
                          onChange={e => setForm({...form, bitgetDemoApiKey: e.target.value})}
                          className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 focus:outline-none focus:border-orange-500 pr-10"
                        />
                        <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showDemoKeys ? 'text-orange-400' : 'text-slate-600'}`} size={16} onClick={() => setShowDemoKeys(!showDemoKeys)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Demo Secret Key</label>
                      <div className="relative">
                        <input 
                          type={showDemoKeys ? "text" : "password"}
                          value={form.bitgetDemoApiSecret}
                          onChange={e => setForm({...form, bitgetDemoApiSecret: e.target.value})}
                          className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 focus:outline-none focus:border-orange-500 pr-10"
                        />
                        <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showDemoKeys ? 'text-orange-400' : 'text-slate-600'}`} size={16} onClick={() => setShowDemoKeys(!showDemoKeys)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Demo Passphrase</label>
                    <div className="relative">
                      <input 
                        type={showDemoKeys ? "text" : "password"}
                        value={form.bitgetDemoPassphrase}
                        onChange={e => setForm({...form, bitgetDemoPassphrase: e.target.value})}
                        className="w-full bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400 focus:outline-none focus:border-orange-500 pr-10"
                      />
                      <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showDemoKeys ? 'text-orange-400' : 'text-slate-600'}`} size={16} onClick={() => setShowDemoKeys(!showDemoKeys)} />
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-orange-950/20 border border-orange-800/20 rounded-xl flex gap-3 items-start">
                     <AlertCircle className="text-orange-400 shrink-0 mt-0.5" size={16} />
                     <p className="text-[10px] text-orange-400/80 leading-relaxed font-thai">
                       💡 **วิธีเปิดใช้งาน Demo**: ล็อกอิน Bitget → สลับเป็น **Demo Mode** → ไปที่ API Management → สร้าง **Demo API Key** (ต้องสร้างแยกจากคีย์หลัก)
                     </p>
                  </div>
                </div>
              </div>

              {/* AI Settings Column */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-[#1e2336] border border-slate-700 rounded-2xl p-6 shadow-2xl sticky top-24">
                  <h2 className="text-xl font-bold text-white mb-6 font-thai flex items-center gap-2">
                    <Zap className="text-teal-400" size={20} />
                    ผู้ให้บริการ AI
                  </h2>
                  
                  <div className="mb-4">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">LLM Provider</label>
                    <select 
                      value={form.aiProvider}
                      onChange={e => setForm({...form, aiProvider: e.target.value})}
                      className="w-full bg-[#111827] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="OPENAI">OpenAI (Original)</option>
                      <option value="OPENROUTER">OpenRouter (Global)</option>
                      <option value="GEMINI">Google Gemini</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">AI Model</label>
                    <select 
                      value={form.aiModel}
                      onChange={e => setForm({...form, aiModel: e.target.value})}
                      className="w-full bg-[#111827] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      {form.aiProvider === 'OPENAI' && (
                        <>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        </>
                      )}
                      {form.aiProvider === 'OPENROUTER' && (
                        <>
                          <option value="moonshotai/kimi-2.5">Kimi 2.5</option>
                          <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
                        </>
                      )}
                      {form.aiProvider === 'GEMINI' && (
                        <>
                          <optgroup label="Gemini 2.0 (New)">
                            <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                            <option value="gemini-2.0-flash-lite-preview-02-05">Gemini 2.0 Flash-Lite</option>
                          </optgroup>
                          <optgroup label="Gemini 1.5 (Stable)">
                            <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
                            <option value="gemini-1.5-pro-latest">Gemini 1.5 Pro</option>
                          </optgroup>
                          <optgroup label="Gemma Family">
                            <option value="gemma-3-27b-it">Gemma-3 27B</option>
                            <option value="gemma-3-12b-it">Gemma-3 12B</option>
                            <option value="gemma-3-4b-it">Gemma-3 4B</option>
                            <option value="gemma-3-1b-it">Gemma-3 1B</option>
                          </optgroup>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="mb-8">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">AI API Key</label>
                    <div className="relative">
                      <input 
                        type={showAiKey ? "text" : "password"}
                        value={form.aiApiKey}
                        onChange={e => setForm({...form, aiApiKey: e.target.value})}
                        className="w-full bg-[#111827] border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-300 pr-10 focus:outline-none focus:border-teal-500" 
                      />
                      <Eye className={`absolute right-3 top-3.5 cursor-pointer ${showAiKey ? 'text-teal-400' : 'text-slate-600'}`} size={16} onClick={() => setShowAiKey(!showAiKey)} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className={`flex items-center gap-2 border px-4 py-3 rounded-xl text-[10px] font-bold tracking-wider ${status.ai === 'verified' ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {status.ai === 'verified' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                      {status.ai === 'verified' ? 'AI STATUS: VERIFIED' : 'AI STATUS: UNVERIFIED'}
                    </div>
                    <button type="button" onClick={testAi} disabled={testingAi} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-[10px] tracking-widest uppercase transition-all">
                      {testingAi ? 'TESTING...' : 'ทดสอบคู่สาย AI'}
                    </button>
                  </div>
                  
                  <div className="mt-8 space-y-4">
                    <button 
                      type="submit"
                      disabled={saving}
                      className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-[#111827] font-extrabold rounded-2xl transition-all font-thai text-sm uppercase tracking-widest shadow-lg shadow-teal-500/20"
                    >
                      {saving ? 'ENCRYPTING...' : 'บันทึกข้อมูลกุญแจ'}
                    </button>
                    
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-500/70 items-start">
                       <Lock className="shrink-0 mt-0.5" size={14}/>
                       <p className="text-[10px] leading-relaxed font-thai">คีย์ของคุณจะถูกเข้ารหัส AES-256-GCM ก่อนบันทึก เราไม่สามารถอ่านได้หากไม่มีมาสเตอร์คีย์</p>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
            {/* Account Management Tab */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl">
                <h2 className="text-2xl font-bold text-white mb-6 font-thai">ข้อมูลโปรไฟล์</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">อีเมลผู้ใช้งาน</label>
                    <div className="bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400">
                      {session?.user?.email || 'ไม่มีข้อมูลอีเมล'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">ระดับสมาชิก</label>
                    <div className="bg-[#0b1121] border border-slate-800 rounded-xl px-4 py-4 flex items-center justify-between">
                      <span className="text-teal-400 font-bold text-sm tracking-widest uppercase">Elite Alpha Trader</span>
                      <Shield className="text-teal-400" size={20} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-red-950/10 border border-red-900/20 p-8 rounded-3xl">
                <h2 className="text-2xl font-bold text-red-500 mb-4 font-thai">ความปลอดภัยและ PDPA</h2>
                <p className="text-slate-400 text-sm font-thai leading-relaxed mb-8">
                  คุณมีสิทธิ์ในการเข้าถึงและลบข้อมูลส่วนบุคคลทั้งหมดตามมาตรฐาน PDPA ข้อมูลทั้งหมดรวมถึง API Keys และประวัติการเทรดจะถูกลบถาวร
                </p>
                <button 
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-2xl font-bold transition-all"
                >
                  <Trash2 size={20} />
                  ลบบัญชีถาวร (Delete Account)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-[#111827] border border-red-500/30 p-8 rounded-[2rem] max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                <AlertCircle className="text-red-500" size={40} />
              </div>
              <h3 className="text-3xl font-bold text-white text-center mb-4 font-thai">ยืนยันการลบ?</h3>
              <p className="text-slate-400 text-center mb-8 font-thai leading-relaxed">
                การดำเนินการนี้จะ <span className="text-red-400 font-bold underline">ลบข้อมูลทั้งหมดถาวร</span> รวมถึง API Keys และประวัติการเทรด 
                เราไม่สามารถกู้คืนข้อมูลได้อีกหลังจากนี้
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition-all"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-extrabold transition-all disabled:opacity-50"
                >
                  {isDeleting ? 'ลบออก...' : 'ยืนยันลบถาวร'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarLayout>
  );
}
