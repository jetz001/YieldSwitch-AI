'use client';

import SidebarLayout from '@/components/SidebarLayout';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function AdminDashboard() {
  useSession();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeBots: 0, health: 98 });
  const [, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    try {
      const [uRes, lRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/logs')
      ]);
      const uData = await uRes.json();
      const lData = await lRes.json();
      
      setUsers(Array.isArray(uData) ? uData : []);
      setLogs(Array.isArray(lData) ? lData : []);
      
      if (Array.isArray(uData)) {
        setStats({
          totalUsers: uData.length,
          activeBots: uData.reduce((acc, u) => acc + (u._count?.BotConfig || 0), 0),
          health: 98
        });
      }
    } catch (error) {
      console.error('Failed to fetch admin data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModerate = async (userId, status) => {
    if (!confirm(`ยืนยันการเปลี่ยนสถานะผู้ใช้เป็น ${status}?`)) return;
    try {
      const res = await fetch('/api/admin/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status })
      });
      if (res.ok) {
        alert('ดำเนินการสำเร็จ');
        fetchAdminData();
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด');
    }
  };

  return (
    <SidebarLayout>
      <div className="p-8">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 font-thai">แผงควบคุมผู้ดูแลระบบ (Admin)</h1>
            <p className="text-slate-400 font-thai">ดูแลระบบ ยับยั้งผู้บุกรุก และจัดการนโยบายความเป็นส่วนตัว</p>
          </div>
          <div className="bg-teal-500/10 border border-teal-500/20 px-4 py-2 rounded-xl">
            <span className="text-teal-400 text-sm font-medium">Status: ระบบปกติ 🟢</span>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { label: 'ผู้ใช้ทั้งหมด', value: stats.totalUsers, icon: '👥' },
            { label: 'บอทที่เปิดใช้งาน', value: stats.activeBots, icon: '🤖' },
            { label: 'ความเสถียรระบบ', value: `${stats.health}%`, icon: '⚡' },
          ].map((item, i) => (
            <div key={i} className="bg-slate-800/40 border border-slate-700/50 p-6 rounded-2xl">
              <div className="text-3xl mb-2">{item.icon}</div>
              <div className="text-slate-400 text-sm mb-1 font-thai">{item.label}</div>
              <div className="text-3xl font-bold text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* User Management Table */}
          <div className="xl:col-span-2 bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white font-thai">รายชื่อผู้ใช้และการจัดการ</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-thai">รหัสผู้ใช้ / อีเมล</th>
                    <th className="px-6 py-4 font-thai text-center">บทบาท</th>
                    <th className="px-6 py-4 font-thai text-center">สถานะ</th>
                    <th className="px-6 py-4 font-thai text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-700/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-white font-medium text-sm">{user.email}</div>
                        <div className="text-slate-500 text-[10px] font-mono">{user.id}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${user.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                          user.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 
                          user.status === 'SUSPENDED' ? 'bg-orange-500/10 text-orange-400' : 
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {user.status === 'ACTIVE' ? (
                            <button 
                              onClick={() => handleModerate(user.id, 'SUSPENDED')}
                              className="px-3 py-1 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded text-xs transition-all font-thai"
                            >
                              ระงับ
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleModerate(user.id, 'ACTIVE')}
                              className="px-3 py-1 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded text-xs transition-all font-thai"
                            >
                              ปลดล็อก
                            </button>
                          )}
                          <button 
                            onClick={() => handleModerate(user.id, 'BANNED')}
                            className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded text-xs transition-all font-thai"
                          >
                            แบน & ลบ Key
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Abuse Logs */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl flex flex-col">
            <div className="p-6 border-b border-slate-700/50">
              <h2 className="text-xl font-bold text-white font-thai">ประวัติการตรวจพบสิ่งผิดปกติ</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[600px]">
              {logs.map((log) => (
                <div key={log.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.alertType === 'RATE_LIMIT' ? 'bg-orange-500/10 text-orange-400' :
                      log.alertType === 'BRUTE_FORCE' ? 'bg-red-500/10 text-red-400' :
                      'bg-teal-500/10 text-teal-400'
                    }`}>
                      {log.alertType}
                    </span>
                    <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-1">{log.description}</p>
                  <p className="text-[10px] text-slate-500 font-mono">IP: {log.ipAddress}</p>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center py-20 text-slate-600 font-thai italic">
                  ยังไม่มีประวัติการทำผิดกฎ
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
