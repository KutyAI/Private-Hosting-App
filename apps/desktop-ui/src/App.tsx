import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { isOnboarded } = useAppStore();

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

  if (!isAuthenticated) {
    return <Onboarding />;
  }

  if (!isOnboarded) {
    return <Onboarding />;
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/console" element={<Console />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/access" element={<Access />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
