'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function Home() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    } else if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-thai animate-pulse text-sm uppercase tracking-widest">กำลังตรวจสอบสิทธิ์การเข้าถึง...</p>
      </div>
    </main>
  );
}
