import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { Console } from './components/console/Console';
import { Settings } from './components/settings/Settings';
import { Access } from './components/access/Access';
import { Backups } from './components/backups/Backups';
import { Onboarding } from './components/onboarding/Onboarding';
import { Diagnostics } from './components/diagnostics/Diagnostics';
import { Guides } from './components/guides/Guides';
import { useAuthStore } from './stores/authStore';
import { useAppStore } from './stores/appStore';
import { X } from 'lucide-react';

function App() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { isOnboarded } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !isOnboarded) {
    return <Onboarding />;
  }

  const isModalOpen = location.pathname !== '/';

  // Helper to render modal titles in Turkish for specific routes
  const getModalTitle = () => {
    switch (location.pathname) {
      case '/console': return 'Sunucu Konsolu';
      case '/settings': return 'Sunucu Ayarları';
      case '/access': return 'Erişim Yetkileri';
      case '/backups': return 'Yedekleme ve Kurtarma';
      case '/diagnostics': return 'Sistem Tanılamaları';
      case '/guides': return 'Yardım & Kılavuzlar';
      default: return 'Detaylar';
    }
  };

  const renderModalContent = () => {
    switch (location.pathname) {
      case '/console':
        return <Console />;
      case '/settings':
        return <Settings />;
      case '/access':
        return <Access />;
      case '/backups':
        return <Backups />;
      case '/diagnostics':
        return <Diagnostics />;
      case '/guides':
        return <Guides />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans relative">
      {/* Sci-Fi Decorative Ambient Background Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating vertical sidebar dock */}
      <Sidebar />

      {/* Main Workspace (Always Dashboard) */}
      <main className="flex-1 overflow-auto p-6 pl-32 relative">
        <Dashboard />
      </main>

      {/* Route matching safety check. Keeps active route in react-router tree. */}
      <div className="hidden">
        <Routes>
          <Route path="/" element={null} />
          <Route path="/console" element={null} />
          <Route path="/settings" element={null} />
          <Route path="/access" element={null} />
          <Route path="/backups" element={null} />
          <Route path="/diagnostics" element={null} />
          <Route path="/guides" element={null} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Slide-over Premium Drawer / Popup Panel */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex justify-end animate-fade-in"
          onClick={() => navigate('/')}
        >
          <div 
            className="w-full max-w-4xl h-full bg-gray-900/90 border-l border-white/10 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col relative animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar inside Drawer */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800/80 bg-gray-950/40">
              <h2 className="text-lg font-bold text-gray-200 capitalize tracking-wide">
                {getModalTitle()}
              </h2>
              <button 
                onClick={() => navigate('/')}
                className="p-2 hover:bg-gray-850 rounded-xl text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content inside Drawer */}
            <div className="flex-1 overflow-auto p-6 md:p-8">
              {renderModalContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
