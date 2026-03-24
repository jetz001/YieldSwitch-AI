'use client';

import { useState, useEffect } from 'react';
import { Target, Save, Check, Loader2 } from 'lucide-react';

export default function TradingGoalCard({ initialValue, onSave }) {
  const [goal, setGoal] = useState(initialValue || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setGoal(initialValue || '');
  }, [initialValue]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(goal);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save trading goal');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
            <Target className="text-teal-500" size={18} />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-thai">เป้าหมาย & คำสั่ง AI</h3>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || goal === initialValue}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            goal === initialValue 
            ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500' 
            : 'bg-teal-500 text-[#0b1121] hover:bg-teal-400'
          }`}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : (showSuccess ? <Check size={14} /> : <Save size={14} />)}
          {showSuccess ? 'บันทึกแล้ว' : 'บันทึก'}
        </button>
      </div>
      
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="เช่น: ต้องการเน้นความปลอดภัย, เปิด Position เฉพาะตลาดขาขึ้นแรงๆ, หรือเน้นกิน Funding Rate"
        className="w-full bg-[#0b1121] border border-slate-800 rounded-xl p-4 text-slate-300 text-sm font-thai focus:outline-none focus:border-teal-500 transition-colors min-h-[120px] resize-none"
      />
      
      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-thai">
        <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></div>
        AI จะใช้ข้อความนี้เป็นแนวทางหลักในการเลือกเหรียญและวางแผนเทรด
      </div>
    </div>
  );
}
