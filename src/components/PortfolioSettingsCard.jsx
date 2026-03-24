'use client';

import { useState, useEffect } from 'react';
import { Settings2, Save, Check, Loader2, DollarSign } from 'lucide-react';

export default function PortfolioSettingsCard({ initialTarget, initialRisk, onSave }) {
  const [target, setTarget] = useState(initialTarget || 0);
  const [risk, setRisk] = useState(initialRisk || 0);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setTarget(initialTarget || 0);
    setRisk(initialRisk || 0);
  }, [initialTarget, initialRisk]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ targetProfitUsdt: target, allocatedPortfolioUsdt: risk });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save portfolio settings');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanged = Number(target) !== Number(initialTarget) || Number(risk) !== Number(initialRisk);

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
            <Settings2 className="text-orange-500" size={18} />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest font-thai">ตั้งค่าเป้าหมาย & งบประมาณ</h3>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanged}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            !hasChanged 
            ? 'opacity-50 cursor-not-allowed bg-slate-800 text-slate-500' 
            : 'bg-orange-500 text-white hover:bg-orange-400'
          }`}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : (showSuccess ? <Check size={14} /> : <Save size={14} />)}
          {showSuccess ? 'บันทึกแล้ว' : 'บันทึก'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase font-bold font-thai">เป้าหมายกำไร (USDT)</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-[#0b1121] border border-slate-800 rounded-xl py-2 pl-8 pr-4 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] text-slate-500 uppercase font-bold font-thai">เงินทุนที่มีความเสี่ยง (USDT)</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
            <input
              type="number"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="w-full bg-[#0b1121] border border-slate-800 rounded-xl py-2 pl-8 pr-4 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-orange-500/5 border border-orange-500/10 rounded-xl text-[10px] text-orange-200/60 font-thai leading-relaxed">
        💡 **กลยุทธ์คืนทุน:** ระบบจะคำนวณกำไรที่ได้มาทบทุน (Compounding) และเมื่อถึงจุดที่เหมาะสม จะ "ดึงทุนออก" เพื่อลดความเสี่ยงให้เหลือ 0 ตามที่คุณเข้าใจถูกต้องแล้วครับ!
      </div>
    </div>
  );
}
