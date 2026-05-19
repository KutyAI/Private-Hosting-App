import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Terminal, Settings, Users, Database, Activity, LogOut, BookOpen } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/console', icon: Terminal, label: 'Console' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/access', icon: Users, label: 'Access' },
  { to: '/backups', icon: Database, label: 'Backups' },
  { to: '/diagnostics', icon: Activity, label: 'Diagnostics' },
  { to: '/guides', icon: BookOpen, label: 'Kılavuzlar' },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { setOnboarded } = useAppStore();

  async function handleLogout() {
    await logout();
    setOnboarded(false);
  }

  return (
    <aside className="fixed left-6 top-6 bottom-6 w-20 bg-gray-900/50 border border-white/10 backdrop-blur-2xl rounded-[32px] flex flex-col justify-between items-center py-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-40 hover:border-emerald-500/20 transition-all duration-300">
      {/* Premium Sci-Fi Glowing Header/Logo */}
      <div className="flex flex-col items-center gap-1 group">
        <div className="w-11 h-11 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.4)] group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.6)] transition-all duration-300">
          <span className="text-white font-extrabold text-base tracking-wider font-sans select-none">MC</span>
        </div>
        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse mt-2" />
      </div>

      {/* Dock Items */}
      <nav className="flex flex-col gap-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative group flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 border ${
                isActive
                  ? 'bg-emerald-600/20 border-emerald-400 text-emerald-400 scale-105 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-gray-800/20 border-gray-800/40 text-gray-400 hover:bg-emerald-600/10 hover:border-emerald-500/50 hover:text-white hover:scale-110'
              }`
            }
          >
            <item.icon className="w-5.5 h-5.5" />
            
            {/* Sci-Fi Premium Tooltip */}
            <span className="absolute left-20 px-3 py-1.5 rounded-xl bg-gray-950/90 border border-white/10 text-xs font-semibold text-gray-200 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none translate-x-2 group-hover:translate-x-0 shadow-2xl backdrop-blur-md whitespace-nowrap z-50">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom Profile / Exit actions */}
      <div className="flex flex-col gap-4 items-center">
        {/* User profile initials preview card */}
        <div className="relative group cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gray-800/80 border border-gray-700/60 flex items-center justify-center hover:border-emerald-500/40 transition-colors">
            <span className="text-xs font-bold text-gray-300">
              {user?.display_name ? user.display_name.substring(0, 2).toUpperCase() : 'US'}
            </span>
          </div>
          <span className="absolute left-20 bottom-1 px-3 py-1.5 rounded-xl bg-gray-950/90 border border-white/10 text-xs font-semibold text-gray-200 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none translate-x-2 group-hover:translate-x-0 shadow-2xl backdrop-blur-md whitespace-nowrap z-50">
            <div className="font-bold text-emerald-400">{user?.display_name || 'User'}</div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">{user?.email}</div>
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleLogout}
          className="relative group flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-800/10 border border-gray-800/30 text-rose-500 hover:bg-rose-600/10 hover:border-rose-500/50 hover:scale-110 transition-all duration-300"
        >
          <LogOut className="w-5 h-5" />
          <span className="absolute left-20 px-3 py-1.5 rounded-xl bg-gray-950/90 border border-rose-500/20 text-xs font-semibold text-rose-400 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none translate-x-2 group-hover:translate-x-0 shadow-2xl backdrop-blur-md whitespace-nowrap z-50">
            Oturumu Kapat
          </span>
        </button>
      </div>
    </aside>
  );
}
