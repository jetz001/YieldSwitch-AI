'use client';

import { useState } from 'react';
import { 
  X, HelpCircle, Book, Shield, BrainCircuit, 
  MessageSquare, ChevronRight, Zap, Target, ArrowRight 
} from 'lucide-react';

export default function HelpModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('guide');

  if (!isOpen) return null;

  const tabs = [
    { id: 'guide', label: 'คู่มือเริ่มใช้งาน', icon: Book },
    { id: 'shield', label: 'The Capital Shield', icon: Shield },
    { id: 'engine', label: 'AI Engine', icon: BrainCircuit },
    { id: 'contact', label: 'ติดต่อเรา', icon: MessageSquare },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'guide':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-teal-400 mb-2">ขั้นตอนการตั้งค่าเริ่มต้น</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                เพื่อให้ระบบทำงานได้อย่างสมบูรณ์ คุณจำเป็นต้องเชื่อมต่อ API Keys ก่อนเริ่มใช้งาน
              </p>
            </div>
            <div className="grid gap-4">
              {[
                { title: 'API Vault', desc: 'ไปที่หน้า "ตั้งค่า" เพื่อกรอก Bitget API Key และ API Secret ของคุณ', icon: Zap },
                { title: 'Market Mode', desc: 'เลือกโหมดตลาดที่ต้องการ (Spot, Futures หรือ Margin) ในแดชบอร์ด', icon: Target },
                { title: 'AutoPilot', desc: 'กดปุ่ม "เริ่มออโต้ไพลอต" เพื่อให้ AI เริ่มวิเคราะห์และเทรดให้คุณ', icon: Zap },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                    <item.icon className="text-teal-500" size={20} />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-slate-200">{item.title}</h4>
                    <p className="text-[12px] text-slate-500 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'shield':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-amber-500 mb-2">ระบบป้องกันทุน (The Capital Shield)</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                กลไกควบคุมความเสี่ยงอัตโนมัติที่ช่วยปกป้องเงินต้นของคุณจากการเทรดที่ผิดพลาด
              </p>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20">
                <h4 className="text-[13px] font-bold text-amber-400 mb-2">ความหมายของค่าต่างๆ</h4>
                <ul className="space-y-3">
                  <li className="text-[12px] text-slate-400 flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    <span><strong>เงินต้นสะสม:</strong> จำนวนเงินทุนทั้งหมดที่คุณนำเข้ามาในระบบ</span>
                  </li>
                  <li className="text-[12px] text-slate-400 flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    <span><strong>ดึงทุนกลับแล้ว:</strong> กำไรที่ถูกดึงออกจากความเสี่ยงเพื่อคืนทุน</span>
                  </li>
                  <li className="text-[12px] text-slate-400 flex items-start gap-2">
                    <span className="text-amber-500 mt-1">•</span>
                    <span><strong>เงินทุนที่มีความเสี่ยง:</strong> เงินทุนที่ยังรันอยู่ในตลาดและอาจเกิดความสูญเสียได้</span>
                  </li>
                </ul>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                * ระบบจะพยายามรักษาสุขภาพพอร์ตให้ไม่ต่ำกว่า 70% อยู่เสมอ หากต่ำกว่านั้น AI จะเริ่มโหมดป้องกันตัว
              </p>
            </div>
          </div>
        );
      case 'engine':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-purple-400 mb-2">AI Cognitive Cycles</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                เบื้องหลังการตัดสินใจของ AI จะแบ่งออกเป็นรอบการคิดที่เรียกว่า Engine Loop
              </p>
            </div>
            <div className="relative border-l-2 border-slate-800 ml-3 space-y-8 py-2">
              {[
                { title: '1. PLAN', desc: 'AI วิเคราะห์เทรนด์ตลาดและโพสิชันที่เปิดอยู่ปัจจุบัน' },
                { title: '2. IMPLEMENT', desc: 'ระบบคำนวณจำนวนเงินที่เหมาะสมและความเป็นไปได้ในการเข้าออเดอร์' },
                { title: '3. TASK CHECK', desc: 'ยืนยันการทำรายการกับ Exchange และบันทึกประวัติ' },
              ].map((step, i) => (
                <div key={i} className="relative pl-8">
                  <div className="absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-[#0b1121] border-2 border-purple-500" />
                  <h4 className="text-[13px] font-bold text-slate-200">{step.title}</h4>
                  <p className="text-[12px] text-slate-500 mt-1">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 'contact':
        return (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-10">
            <div className="w-20 h-20 rounded-full bg-teal-500/10 flex items-center justify-center">
              <MessageSquare className="text-teal-500" size={40} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">ต้องการความช่วยเหลือเพิ่มเติม?</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-[280px]">
                ทีมงานเทคนิคของเราพร้อมให้คำปรึกษาและแก้ไขปัญหาให้คุณตลอด 24 ชั่วโมง
              </p>
            </div>
            <button className="flex items-center gap-2 px-8 py-3 bg-teal-500 text-[#0b1121] rounded-xl font-bold hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20">
              ติดต่อทีมงาน Support <ArrowRight size={18} />
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#0b1121]/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-[#111827] border border-slate-800 rounded-3xl shadow-2xl flex flex-col md:flex-row h-[600px] overflow-hidden lg:h-[500px]">
        
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
          <div className="p-6 flex items-center gap-3">
            <HelpCircle className="text-teal-500" size={20} />
            <span className="font-bold text-white tracking-widest text-sm">HELP CENTER</span>
          </div>
          <nav className="p-2 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                    activeTab === tab.id 
                    ? 'bg-teal-500/10 text-teal-400 font-bold' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={18} />
                    {tab.label}
                  </div>
                  {activeTab === tab.id && <ChevronRight size={14} />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col h-full bg-[#0b1121]/50 backdrop-blur-xl overflow-hidden relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-white transition-all z-10"
          >
            <X size={20} />
          </button>

          <main className="flex-1 p-8 overflow-y-auto scrollbar-hide">
             {renderContent()}
          </main>

          <footer className="p-4 border-t border-slate-800 bg-slate-900/30 flex items-center justify-between">
            <div className="text-[10px] text-slate-600 font-mono">
              VERSION 2.4.1.2024
            </div>
            <div className="text-[10px] text-slate-500 font-thai">
              Powered by YieldSwitch AI
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
