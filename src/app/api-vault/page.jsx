'use client';

import SidebarLayout from '@/components/SidebarLayout';
import { useState, useEffect } from 'react';
import { Shield, Eye, RefreshCw, Lock, HardDrive, CheckCircle, AlertCircle } from 'lucide-react';

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
    aiApiKey: '',
    aiProvider: 'OPENAI',
    aiModel: 'gpt-4o'
  });

  const [showAiKey, setShowAiKey] = useState(false);
  const [showBitgetKeys, setShowBitgetKeys] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/users/me');
      const data = await res.json();
      if (res.ok) {
        setForm(data);
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
    console.log('Attempting to save form:', form);
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

  const testBitget = async () => {
    setTestingBitget(true);
    setStatus(s => ({ ...s, bitget: 'testing' }));
    try {
      const res = await fetch('/api/test/bitget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bitgetApiKey: form.bitgetApiKey, 
          bitgetApiSecret: form.bitgetApiSecret, 
          bitgetPassphrase: form.bitgetPassphrase 
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(s => ({ ...s, bitget: 'verified' }));
        alert(`${data.message}\nยอดเงินปัจจุบัน: ${data.balance} USDT`);
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
      <div className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-white mb-2 decoration-teal-500 font-thai">คลังเก็บบัญชีนิรภัย: สร้างคีย์ของคุณเอง</h1>
          <p className="text-slate-400 font-thai">เงินทุนของคุณสมควรได้รับความเป็นส่วนตัวขั้นสูงสุด เราไม่จัดเก็บคีย์ดิบของคุณ ข้อมูลจะถูกเข้ารหัสก่อนบันทึก และจะคงอยู่เฉพาะในเซิร์ฟเวอร์แบบหน่วยความจำเท่านั้นระหว่างการเทรด</p>
        </div>

        <div className="flex gap-4 mb-8">
          <div className="flex items-center gap-2 bg-green-900/30 text-green-400 border border-green-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
            <Shield size={14} /> เข้ารหัสระดับทหาร AES-256
          </div>
          <div className="flex items-center gap-2 bg-blue-900/30 text-blue-400 border border-blue-800/50 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase">
            <HardDrive size={14} /> ทำงานบนหน่วยความจำชั่วคราวเท่านั้น
          </div>
        </div>

        <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          {/* Bitget Configuration */}
          <div className="col-span-3 bg-[#111827] border border-teal-900/50 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-teal-500/50"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1 font-thai">ตั้งค่าเชื่อมต่อ Bitget (V2)</h2>
                <p className="text-sm text-slate-400 italic font-thai">เชื่อมต่อศูนย์กลางสภาพคล่องของคุณ</p>
              </div>
              <div className="bg-slate-800 text-slate-300 text-[10px] uppercase px-2 py-1 rounded font-bold tracking-wider">ความปลอดภัยชั้นที่ 2</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Bitget API KEY</label>
                <div className="relative">
                  <input 
                    type={showBitgetKeys ? "text" : "password"}
                    value={form.bitgetApiKey}
                    onChange={e => setForm({...form, bitgetApiKey: e.target.value})}
                    onFocus={e => e.target.value.includes('•') && setForm({...form, bitgetApiKey: ''})}
                    className="w-full bg-[#0b1121] border border-slate-800 rounded px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500 pr-10"
                  />
                  <Eye 
                    className={`absolute right-3 top-3.5 cursor-pointer transition-colors ${showBitgetKeys ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'}`} 
                    size={16} 
                    onClick={() => setShowBitgetKeys(!showBitgetKeys)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">Bitget API SECRET</label>
                <div className="relative">
                  <input 
                    type={showBitgetKeys ? "text" : "password"}
                    value={form.bitgetApiSecret}
                    onChange={e => setForm({...form, bitgetApiSecret: e.target.value})}
                    onFocus={e => e.target.value.includes('•') && setForm({...form, bitgetApiSecret: ''})}
                    className="w-full bg-[#0b1121] border border-slate-800 rounded px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500 pr-10"
                  />
                  <Eye 
                    className={`absolute right-3 top-3.5 cursor-pointer transition-colors ${showBitgetKeys ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'}`} 
                    size={16} 
                    onClick={() => setShowBitgetKeys(!showBitgetKeys)}
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">PASSPHRASE</label>
              <input 
                type="password"
                value={form.bitgetPassphrase}
                onChange={e => setForm({...form, bitgetPassphrase: e.target.value})}
                placeholder="รหัสผ่านเชื่อมต่อของ API Bitget" 
                className="w-full bg-[#0b1121] border border-slate-800 rounded px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-teal-500" 
              />
            </div>

            <div className="flex bg-[#0b1121] border border-slate-800 rounded mb-4">
              <div className="flex-1 px-4 py-3 flex items-center gap-3 text-amber-500 border-r border-slate-800">
                <Lock size={16} />
                <span className="text-[10px] font-thai uppercase tracking-tighter">คีย์ทั้งหมดจะถูกเข้ารหัสก่อนบันทึกลงฐานข้อมูล</span>
              </div>
              <button 
                type="button"
                onClick={testBitget}
                disabled={testingBitget}
                className="px-6 py-3 text-slate-300 hover:text-white hover:bg-slate-800 font-bold text-[10px] tracking-wide uppercase flex items-center gap-2 transition-colors"
              >
                ทดสอบเชื่อมต่อ <RefreshCw size={14} className={testingBitget ? 'animate-spin' : ''} />
              </button>
            </div>

            <button 
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-teal-500 hover:bg-teal-400 text-[#111827] font-bold rounded-xl transition-all font-thai text-sm uppercase tracking-widest"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั้งหมด'}
            </button>
          </div>

          {/* AI Configuration */}
          <div className="col-span-2 space-y-6">
            <div className="bg-[#1e2336] border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-bold text-white mb-6 font-thai">ผู้ให้บริการ AI อัจฉริยะ</h2>
              
              <div className="mb-4">
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">เลือกระบบผู้ให้บริการ (LLM)</label>
                <select 
                  value={form.aiProvider}
                  onChange={e => setForm({...form, aiProvider: e.target.value})}
                  className="w-full bg-[#111827] border border-slate-700 rounded px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
                >
                  <option value="OPENAI">OpenAI (GPT-4o)</option>
                  <option value="OPENROUTER">OpenRouter (Kimi 2.5 / DeepSeek)</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">เลือกโมเดล (Model)</label>
                <select 
                  value={form.aiModel}
                  onChange={e => setForm({...form, aiModel: e.target.value})}
                  className="w-full bg-[#111827] border border-slate-700 rounded px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-slate-500"
                >
                  {form.aiProvider === 'OPENAI' ? (
                    <>
                      <option value="gpt-4o">GPT-4o (Standard)</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    </>
                  ) : (
                    <>
                      <option value="moonshotai/kimi-2.5">Kimi 2.5 (OpenRouter)</option>
                      <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
                    </>
                  )}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">ตั้งค่า API KEY ของ AI</label>
                <div className="relative">
                  <input 
                    type={showAiKey ? "text" : "password"}
                    value={form.aiApiKey}
                    onChange={e => setForm({...form, aiApiKey: e.target.value})}
                    onFocus={e => e.target.value.includes('•') && setForm({...form, aiApiKey: ''})}
                    placeholder="sk-..." 
                    className="w-full bg-[#111827] border border-slate-700 rounded px-4 py-3 text-sm text-slate-300 pr-10 focus:outline-none focus:border-teal-500" 
                  />
                  <Eye 
                    className={`absolute right-3 top-3.5 cursor-pointer transition-colors ${showAiKey ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'}`} 
                    size={16} 
                    onClick={() => setShowAiKey(!showAiKey)}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div className={`flex items-center gap-2 border px-3 py-2 rounded text-[10px] font-bold tracking-wider ${status.ai === 'verified' ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {status.ai === 'verified' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {status.ai === 'verified' ? 'ยืนยันแล้ว' : 'ยังไม่ถูกตรวจสอบ'}
                </div>
                <button 
                  type="button"
                  onClick={testAi}
                  disabled={testingAi}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 rounded text-[10px] tracking-wider uppercase transition-colors flex items-center justify-center gap-2"
                >
                  {testingAi ? 'Checking...' : 'ทดสอบเชื่อมต่อ'}
                </button>
              </div>
            </div>

            <div className="bg-slate-800/20 border border-slate-700/50 p-4 rounded-xl">
              <p className="text-[11px] text-slate-500 leading-relaxed font-thai italic">
                * สำหรับ OpenRouter กรุณาใช้ URL https://openrouter.ai/api/v1 (จัดการโดยระบบอัตโนมัติ) และรองรับ Kimi 2.5 ของ Moonshot AI
              </p>
            </div>
          </div>
        </form>
      </div>
    </SidebarLayout>
  );
}
