'use client';

import SidebarLayout from '@/components/SidebarLayout';
import { useState, useEffect } from 'react';
import { Shield, Eye, RefreshCw, Lock, HardDrive, CheckCircle, AlertCircle, Zap } from 'lucide-react';

export default function ApiVault() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    e.preventDefault();
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

  if (loading) return <SidebarLayout><div className="p-8 text-white font-thai">กำลังโหลดข้อมูล...</div></SidebarLayout>;

  return (
    <SidebarLayout>
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-white mb-2 decoration-teal-500 font-thai">คลังเก็บบัญชีนิรภัย (API Vault)</h1>
          <p className="text-slate-400 font-thai">เราใช้การเข้ารหัส AES-256-GCM เพื่อปกป้อง API Key ของคุณ ข้อมูลจะถูกใช้งานเฉพาะในระหว่างกระบวนการเทรดเท่านั้น</p>
        </div>

        <div className="flex gap-4 mb-8">
          <div className="flex items-center gap-2 bg-green-900/30 text-green-400 border border-green-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
            <Shield size={14} /> เข้ารหัส AES-256 แบบปกปิดสมบูรณ์
          </div>
          <div className="flex items-center gap-2 bg-blue-900/30 text-blue-400 border border-blue-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
            <HardDrive size={14} /> ทำงานบน RAM ชั่วคราว (Zero-Log)
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

              <div className="grid grid-cols-2 gap-4 mb-4">
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
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 transition-all border border-slate-700/50"
                >
                  {testingBitget ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  ทดสอบบัญชีจริง
                </button>
                <button 
                  type="button" onClick={() => testBitget(true)} disabled={testingBitget}
                  className="flex-1 py-2.5 bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 rounded-xl text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 transition-all border border-orange-800/30"
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

              <div className="grid grid-cols-2 gap-4 mb-4">
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

              <div className="mt-6 p-4 bg-orange-950/20 border border-orange-800/20 rounded-xl">
                 <p className="text-[10px] text-orange-400/80 leading-relaxed font-thai">
                   💡 **วิธีเปิดใช้งาน Demo**: ล็อกอิน Bitget → สลับเป็น **Demo Mode** → ไปที่ API Management → สร้าง **Demo API Key** (ต้องสร้างแยกจากคีย์หลัก)
                 </p>
              </div>
            </div>
          </div>

          {/* AI Settings Column */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#1e2336] border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-6 font-thai">ผู้ให้บริการ AI อัจฉริยะ</h2>
              
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
                      <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash (🚀 Stable 500 RPD)</option>
                      <option value="gemma-3-4b-it">Gemma-3 4B (✅ verified Working Now)</option>
                      <option value="gemini-3.1-pro">Gemini 3.1 Pro (⚠️ High Rate - Likely 404)</option>
                      <option value="nano-banana-pro">Nano Banana Pro (Image/Reasoning)</option>
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
                <div className={`flex items-center gap-2 border px-3 py-3 rounded-xl text-[10px] font-bold tracking-wider ${status.ai === 'verified' ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {status.ai === 'verified' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {status.ai === 'verified' ? 'AI STATUS: VERIFIED' : 'AI STATUS: UNVERIFIED'}
                </div>
                <button type="button" onClick={testAi} disabled={testingAi} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-[10px] tracking-widest uppercase transition-all">
                  {testingAi ? 'TESTING...' : 'ทดสอบคู่สาย AI'}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={saving}
              className="w-full py-5 bg-teal-500 hover:bg-teal-400 text-[#111827] font-extrabold rounded-2xl transition-all font-thai text-sm uppercase tracking-[0.2em] shadow-lg shadow-teal-500/20"
            >
              {saving ? 'กำลังบันทึก (ENCRYPTING...)' : 'บันทึกข้อมูลและล็อคห้องเก็บบัญชี'}
            </button>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3 text-amber-500/70 items-start">
               <Lock className="shrink-0 mt-0.5" size={14}/>
               <p className="text-[10px] leading-relaxed font-thai">คีย์ของคุณจะถูกเข้ารหัสระดับทหารก่อนบันทึก เราไม่สามารถอ่านพาสเวิร์ดได้หากไม่มีรหัสถอดรหัส (Encryption Key) ส่วนตัวที่รันเฉพาะในหน่วยความจำเซิร์ฟเวอร์เท่านั้น</p>
            </div>
          </div>
        </form>
      </div>
    </SidebarLayout>
  );
}
