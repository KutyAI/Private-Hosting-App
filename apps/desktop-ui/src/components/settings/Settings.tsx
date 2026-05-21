import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { sendIPCCommand } from '../../services/ipcClient';
import { Sliders, Globe, RefreshCw, Trash2, CheckCircle } from 'lucide-react';

export function Settings() {
  const { servers, selectedServer } = useAppStore();
  const [activeTab, setActiveTab] = useState<'server' | 'connection'>('server');
  
  // Server settings state
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Connection settings state
  const [supabaseUrlInput, setSupabaseUrlInput] = useState(localStorage.getItem('CUSTOM_SUPABASE_URL') || '');
  const [supabaseAnonKeyInput, setSupabaseAnonKeyInput] = useState(localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY') || '');
  const [apiUrlInput, setApiUrlInput] = useState(localStorage.getItem('CUSTOM_API_URL') || '');
  const [savingConnection, setSavingConnection] = useState(false);
  const [savedConnection, setSavedConnection] = useState(false);

  const selected = servers.find(s => s.id === selectedServer);

  // Auto-switch to connection tab if no server is selected
  useEffect(() => {
    if (!selectedServer) {
      setActiveTab('connection');
    }
  }, [selectedServer]);

  useEffect(() => {
    if (selectedServer && activeTab === 'server') {
      loadProperties();
    }
  }, [selectedServer, activeTab]);

  async function loadProperties() {
    try {
      const result = await sendIPCCommand<Record<string, string>>('server.properties.get', { server_id: selectedServer });
      if (result) setProperties(result);
    } catch {}
  }

  async function handleSave() {
    if (!selectedServer) return;
    setSaving(true);
    setSaved(false);
    try {
      await sendIPCCommand('server.properties.update', { server_id: selectedServer, properties });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateProp(key: string, value: string) {
    setProperties(prev => ({ ...prev, [key]: value }));
  }

  function handleSaveConnection() {
    setSavingConnection(true);
    setSavedConnection(false);
    
    setTimeout(() => {
      if (supabaseUrlInput.trim()) {
        localStorage.setItem('CUSTOM_SUPABASE_URL', supabaseUrlInput.trim());
      } else {
        localStorage.removeItem('CUSTOM_SUPABASE_URL');
      }

      if (supabaseAnonKeyInput.trim()) {
        localStorage.setItem('CUSTOM_SUPABASE_ANON_KEY', supabaseAnonKeyInput.trim());
      } else {
        localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');
      }

      if (apiUrlInput.trim()) {
        localStorage.setItem('CUSTOM_API_URL', apiUrlInput.trim());
      } else {
        localStorage.removeItem('CUSTOM_API_URL');
      }
      
      setSavedConnection(true);
      setSavingConnection(false);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }, 800);
  }

  function handleResetConnection() {
    localStorage.removeItem('CUSTOM_SUPABASE_URL');
    localStorage.removeItem('CUSTOM_SUPABASE_ANON_KEY');
    localStorage.removeItem('CUSTOM_API_URL');
    window.location.reload();
  }

  const textProps = [
    { key: 'motd', label: 'MOTD' },
    { key: 'level-name', label: 'World Name' },
    { key: 'server-ip', label: 'Server IP' },
  ];

  const numberProps = [
    { key: 'server-port', label: 'Port' },
    { key: 'max-players', label: 'Max Players' },
    { key: 'view-distance', label: 'View Distance' },
    { key: 'simulation-distance', label: 'Simulation Distance' },
  ];

  const boolProps = [
    { key: 'online-mode', label: 'Online Mode' },
    { key: 'white-list', label: 'Whitelist' },
    { key: 'allow-flight', label: 'Allow Flight' },
    { key: 'spawn-monsters', label: 'Spawn Monsters' },
    { key: 'spawn-animals', label: 'Spawn Animals' },
    { key: 'pvp', label: 'PvP' },
    { key: 'hardcore', label: 'Hardcore' },
    { key: 'enable-command-block', label: 'Command Blocks' },
  ];

  const selectProps = [
    { key: 'gamemode', label: 'Gamemode', options: ['survival', 'creative', 'adventure', 'spectator'] },
    { key: 'difficulty', label: 'Difficulty', options: ['peaceful', 'easy', 'normal', 'hard'] },
  ];

  const isDefaultSupabaseUrl = !localStorage.getItem('CUSTOM_SUPABASE_URL');
  const isDefaultSupabaseAnon = !localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY');
  const isDefaultApiUrl = !localStorage.getItem('CUSTOM_API_URL');

  return (
    <div className="space-y-6">
      {/* Premium Tab bar navigation */}
      <div className="flex border-b border-gray-800/80 pb-px">
        <button
          onClick={() => {
            if (selectedServer) {
              setActiveTab('server');
            }
          }}
          disabled={!selectedServer}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-medium transition-all ${
            activeTab === 'server'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/20'
          } ${!selectedServer ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <Sliders className="w-4 h-4" />
          Server Settings
        </button>
        <button
          onClick={() => setActiveTab('connection')}
          className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-medium transition-all ${
            activeTab === 'connection'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/20'
          }`}
        >
          <Globe className="w-4 h-4" />
          App Connections
        </button>
      </div>

      {activeTab === 'server' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Server Properties</h2>
            {selected && (
              <span className="text-gray-400 px-3 py-1 bg-gray-800/80 rounded-lg text-xs border border-gray-700/50">
                {selected.name}
              </span>
            )}
          </div>

          {saved && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Settings saved successfully
            </div>
          )}

          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 space-y-6 backdrop-blur-sm">
            <div>
              <h3 className="text-md font-semibold text-gray-300 mb-4">General Properties</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {textProps.map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
                    <input
                      type="text"
                      value={properties[key] || ''}
                      onChange={(e) => updateProp(key, e.target.value)}
                      className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    />
                  </div>
                ))}
                {numberProps.map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
                    <input
                      type="number"
                      value={properties[key] || ''}
                      onChange={(e) => updateProp(key, e.target.value)}
                      className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    />
                  </div>
                ))}
                {selectProps.map(({ key, label, options }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">{label}</label>
                    <select
                      value={properties[key] || options[0]}
                      onChange={(e) => updateProp(key, e.target.value)}
                      className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                    >
                      {options.map(opt => (
                        <option key={opt} value={opt} className="bg-gray-850">{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-800/60 pt-6">
              <h3 className="text-md font-semibold text-gray-300 mb-4">Toggles</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {boolProps.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 p-3.5 bg-gray-800/40 border border-gray-800/40 rounded-xl cursor-pointer hover:bg-gray-800 hover:border-gray-750 transition-all">
                    <input
                      type="checkbox"
                      checked={properties[key] === 'true'}
                      onChange={(e) => updateProp(key, e.target.checked ? 'true' : 'false')}
                      className="w-4.5 h-4.5 rounded bg-gray-700 border-gray-650 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-gray-900"
                    />
                    <span className="text-sm font-medium text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-sm font-medium rounded-lg transition-all shadow-md active:scale-[0.98]"
              >
                {saving ? 'Saving...' : 'Save Properties'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'connection' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold">App Connection Settings</h2>
            <p className="text-sm text-gray-400 mt-1">
              Configure custom credentials for hosting your own private networks or testing custom environments.
            </p>
          </div>

          {savedConnection && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 animate-bounce" />
              Settings saved! Restarting the app connection...
            </div>
          )}

          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 space-y-6 backdrop-blur-sm">
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-gray-400 font-medium uppercase tracking-wider">Custom Supabase URL</label>
                  {isDefaultSupabaseUrl ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">USING PRE-BAKED DEFAULT</span>
                  ) : (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">OVERRIDDEN</span>
                  )}
                </div>
                <input
                  type="text"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-gray-400 font-medium uppercase tracking-wider">Custom Supabase Anon Key</label>
                  {isDefaultSupabaseAnon ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">USING PRE-BAKED DEFAULT</span>
                  ) : (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">OVERRIDDEN</span>
                  )}
                </div>
                <textarea
                  value={supabaseAnonKeyInput}
                  onChange={(e) => setSupabaseAnonKeyInput(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  rows={3}
                  className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono resize-none animate-pulse-subtle"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-gray-400 font-medium uppercase tracking-wider">Custom Backend API URL</label>
                  {isDefaultApiUrl ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">USING PRE-BAKED DEFAULT</span>
                  ) : (
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">OVERRIDDEN</span>
                  )}
                </div>
                <input
                  type="text"
                  value={apiUrlInput}
                  onChange={(e) => setApiUrlInput(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="w-full bg-gray-800/60 border border-gray-750 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleSaveConnection}
                disabled={savingConnection}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-sm font-medium rounded-lg transition-all shadow-md active:scale-[0.98]"
              >
                <RefreshCw className={`w-4 h-4 ${savingConnection ? 'animate-spin' : ''}`} />
                {savingConnection ? 'Saving...' : 'Save & Reload'}
              </button>

              {(!isDefaultSupabaseUrl || !isDefaultSupabaseAnon || !isDefaultApiUrl) && (
                <button
                  onClick={handleResetConnection}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-sm font-medium rounded-lg transition-all active:scale-[0.98]"
                >
                  <Trash2 className="w-4 h-4" />
                  Reset to Defaults
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
