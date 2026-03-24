'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, Lock, Users, Fingerprint, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result.error) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-4 font-sans text-slate-300">
      
      {/* Brand & Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 mb-4 shadow-[0_0_20px_rgba(20,184,166,0.1)]">
          <Shield className="text-teal-500" size={24} />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">YieldSwitch AI</h1>
        <p className="text-sm text-slate-400 font-thai text-center">ระบบเทรดอัลกอริทึมระดับองค์กร</p>
      </div>

      {/* Login Box */}
      <div className="w-full max-w-md bg-[#111827] rounded-2xl p-8 border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-teal-500/50 to-transparent"></div>
        
        {/* Google Provider */}
        <button 
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full bg-white text-slate-900 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 hover:bg-slate-100 transition-colors mb-6"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          เข้าสู่ระบบด้วย Google
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-slate-800"></div>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-medium font-thai">เข้าสู่ระบบผ่านบัญชี</span>
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs text-center font-thai">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 uppercase tracking-wide mb-2 font-thai">อีเมลผู้ใช้งาน</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="investor@yieldswitch.ai" 
              className="w-full bg-[#0b1121] border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs text-slate-400 uppercase tracking-wide font-thai">รหัสผ่าน</label>
              <Link href="#" className="text-xs text-teal-500 hover:text-teal-400 transition-colors font-thai">ลืมรหัสผ่าน?</Link>
            </div>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••" 
              className="w-full bg-[#0b1121] border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-teal-500 hover:bg-teal-400 text-[#0b1121] font-bold py-3 mt-2 rounded-lg text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2 font-thai disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'เข้าสู่ระบบดิจิทัลวอลต์'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6 font-thai">
          ยังไม่มีบัญชีผู้ใช้? <Link href="#" className="text-teal-500 hover:text-teal-400 font-medium transition-colors">สมัครสมาชิกที่นี่</Link>
        </p>
      </div>

      {/* Footer Security Badges */}
      <div className="mt-12 flex gap-12 items-center text-slate-500">
        <div className="flex flex-col items-center gap-2">
          <Lock size={16} />
          <span className="text-[10px] uppercase tracking-widest font-medium font-thai text-center">เข้ารหัส AES-256</span>
        </div>
        <div className="w-px h-8 bg-slate-800"></div>
        <div className="flex flex-col items-center gap-2">
          <Users size={16} />
          <span className="text-[10px] uppercase tracking-widest font-medium font-thai text-center">ระบบจัดเก็บแยกผู้เช่า</span>
        </div>
        <div className="w-px h-8 bg-slate-800"></div>
        <div className="flex flex-col items-center gap-2">
          <Fingerprint size={16} />
          <span className="text-[10px] uppercase tracking-widest font-medium font-thai text-center">มาตรฐานความปลอดภัย SOC2</span>
        </div>
      </div>
      
      <div className="mt-8 text-[10px] text-slate-600 uppercase tracking-widest text-center font-thai px-4">
        สงวนสิทธิ์การเข้าถึงสำหรับผู้ใช้ที่ได้รับอนุญาต • ระบบเฝ้าระวัง: ทำงานปกติ
      </div>
    </div>
  );
}
