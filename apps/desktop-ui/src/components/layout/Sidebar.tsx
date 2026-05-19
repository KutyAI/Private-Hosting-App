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
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-emerald-400">MC Hosting</h1>
        <p className="text-xs text-gray-400 mt-1">Server Manager</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium">{user?.display_name || 'User'}</div>
            <div className="text-xs text-gray-500 truncate max-w-[140px]">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
        <div className="text-xs text-gray-600 mt-2">v0.1.0</div>
      </div>
    </aside>
  );
}
