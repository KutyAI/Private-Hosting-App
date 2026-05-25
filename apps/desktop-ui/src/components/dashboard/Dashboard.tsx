import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Users, HardDrive, Cpu, Wifi, Trash2, Plus, Sparkles, Zap, Server, Database, Search, Loader2 } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { connectIPC, sendIPCCommand, setConnectionStateHandler, disconnectIPC } from '../../services/ipcClient';
import type { LocalServer, LogEntry, ModrinthSearchResult, ModrinthVersionInfo, ServerMetrics } from '@mc-host/shared-types';
import { SupabaseObservability } from './SupabaseObservability';

export function Dashboard() {
  const { servers, selectedServer, setSelectedServer, metrics, setServers, updateMetrics, setConnected, isConnected, addLog } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'servers' | 'telemetry'>('servers');
  const selectedServerRef = useRef(selectedServer);
  const isConnectedRef = useRef(isConnected);

  useEffect(() => {
    selectedServerRef.current = selectedServer;
    isConnectedRef.current = isConnected;
  }, [selectedServer, isConnected]);

  const handleIPCMessage = useCallback((data: any) => {
    if (data.type === 'log' && data.server_id && data.entry) {
      addLog(data.server_id, data.entry as LogEntry);
    }
  }, [addLog]);

  const loadServers = useCallback(async () => {
    try {
      const list = await sendIPCCommand<LocalServer[]>('server.list');
      setServers(list || []);
    } catch {
      setServers([]);
    }
  }, [setServers]);

  const refreshMetrics = useCallback(async (serverId: string) => {
    try {
      const m = await sendIPCCommand<ServerMetrics>('server.metrics.get', { server_id: serverId });
      if (m) updateMetrics(serverId, m);
    } catch {}
  }, [updateMetrics]);

  useEffect(() => {
    setConnectionStateHandler((connected) => {
      setConnected(connected);
      if (connected) {
        loadServers();
      }
    });

    connectIPC(handleIPCMessage)
      .then(() => {
        setConnected(true);
        loadServers();
      })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      const server = selectedServerRef.current;
      const connected = isConnectedRef.current;
      if (server && connected) {
        refreshMetrics(server);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      disconnectIPC();
    };
  }, []);

  async function handleStart(serverId: string) {
    try {
      await sendIPCCommand('server.start', { server_id: serverId });
      await new Promise(r => setTimeout(r, 1000));
      loadServers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleStop(serverId: string) {
    try {
      await sendIPCCommand('server.stop', { server_id: serverId });
      await new Promise(r => setTimeout(r, 1000));
      loadServers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleRestart(serverId: string) {
    try {
      await sendIPCCommand('server.restart', { server_id: serverId });
      await new Promise(r => setTimeout(r, 1000));
      loadServers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDelete(serverId: string) {
    if (!confirm(`Delete server "${serverId}"? This cannot be undone.`)) return;
    try {
      await sendIPCCommand('server.delete', { server_id: serverId });
      if (selectedServer === serverId) setSelectedServer(null);
      loadServers();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const selectedMetrics = selectedServer ? metrics[selectedServer] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Connecting to agent...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <Wifi className="w-4 h-4" />
            {isConnected ? 'Agent Connected' : 'Agent Disconnected'}
          </div>
          {activeTab === 'servers' && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Server
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Players" value={selectedMetrics?.player_count ?? 0} />
        <StatCard icon={Cpu} label="Memory" value={`${selectedMetrics?.memory_used_mb ?? 0} MB`} />
        <StatCard icon={HardDrive} label="Uptime" value={selectedMetrics ? `${Math.floor(selectedMetrics.uptime_seconds / 60)}m` : '--'} />
        <StatCard icon={Activity} label="TPS" value={selectedMetrics?.tps ?? '--'} />
      </div>

      {/* Sci-Fi Premium Glowing Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1">
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-bold tracking-wide uppercase transition-all duration-300 rounded-t-xl ${
            activeTab === 'servers'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-[0_4px_20px_-10px_rgba(16,185,129,0.4)]'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Sunucu Yönetimi
        </button>
        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-xs font-bold tracking-wide uppercase transition-all duration-300 rounded-t-xl ${
            activeTab === 'telemetry'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-[0_4px_20px_-10px_rgba(16,185,129,0.4)]'
              : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Veritabanı Sağlığı (Telemetry)
        </button>
      </div>

      {activeTab === 'servers' ? (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Servers ({servers.length})</h3>
          {servers.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <p className="mb-4">No servers yet.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create your first server
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedServer === server.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedServer(server.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{server.name}</h4>
                      <p className="text-sm text-gray-400">
                        {server.server_type} {server.mc_version} • Port {server.port}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        server.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                        server.status === 'starting' ? 'bg-yellow-500/20 text-yellow-400' :
                        server.status === 'crashed' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-600 text-gray-300'
                      }`}>
                        {server.status}
                      </span>
                      <div className="flex items-center gap-1">
                        {server.status === 'running' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRestart(server.id); }}
                              className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                              title="Restart"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStop(server.id); }}
                              className="p-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                              title="Stop"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {server.status === 'stopped' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStart(server.id); }}
                            className="p-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 transition-colors"
                            title="Start"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(server.id); }}
                          className="p-1.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <SupabaseObservability />
      )}

      {showCreate && (
        <CreateServerModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadServers(); }} />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );
}

function Activity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function CreateServerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    server_type: 'vanilla' as 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge',
    mc_version: '',
    memory_min_mb: 1024,
    memory_max_mb: 2048,
    port: 25565,
    auto_port: true,
  });
  const [versions, setVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modrinthQuery, setModrinthQuery] = useState('');
  const [searchingModrinth, setSearchingModrinth] = useState(false);
  const [modrinthResults, setModrinthResults] = useState<ModrinthSearchResult[]>([]);
  const [selectedModrinthProject, setSelectedModrinthProject] = useState<ModrinthSearchResult | null>(null);
  const [selectedModrinthVersion, setSelectedModrinthVersion] = useState<ModrinthVersionInfo | null>(null);
  const [modrinthVersions, setModrinthVersions] = useState<ModrinthVersionInfo[]>([]);
  const [loadingModrinthVersions, setLoadingModrinthVersions] = useState(false);

  useEffect(() => {
    let active = true;
    async function fetchVersions() {
      if (form.server_type !== 'vanilla' && form.server_type !== 'paper') {
        setLoadingVersions(false);
        return;
      }

      setLoadingVersions(true);
      try {
        if (form.server_type === 'vanilla') {
          const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
          const data = await res.json();
          if (active) {
            const releases = data.versions
              .filter((v: any) => v.type === 'release')
              .map((v: any) => v.id);
            setVersions(releases);
            if (releases.length > 0) {
              setForm(f => ({ ...f, mc_version: f.mc_version && releases.includes(f.mc_version) ? f.mc_version : releases[0] }));
            }
          }
        } else if (form.server_type === 'paper') {
          const res = await fetch('https://api.papermc.io/v2/projects/paper');
          const data = await res.json();
          if (active) {
            const paperVersions = [...data.versions].reverse();
            setVersions(paperVersions);
            if (paperVersions.length > 0) {
              setForm(f => ({ ...f, mc_version: f.mc_version && paperVersions.includes(f.mc_version) ? f.mc_version : paperVersions[0] }));
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch versions, using fallback:', err);
        if (active) {
          const fallback = ['1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'];
          setVersions(fallback);
          setForm(f => ({ ...f, mc_version: fallback.includes(f.mc_version) ? f.mc_version : '1.20.4' }));
        }
      } finally {
        if (active) setLoadingVersions(false);
      }
    }
    fetchVersions();
    return () => {
      active = false;
    };
  }, [form.server_type]);

  async function handleSearchModrinth() {
    const query = modrinthQuery.trim();
    if (!query) return;

    setSearchingModrinth(true);
    try {
      const results = await sendIPCCommand<ModrinthSearchResult[]>('modrinth.search', { query, limit: 12 });
      setModrinthResults(results || []);
      setSelectedModrinthProject(null);
      setSelectedModrinthVersion(null);
      setModrinthVersions([]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSearchingModrinth(false);
    }
  }

  async function handleSelectModrinthProject(project: ModrinthSearchResult) {
    setSelectedModrinthProject(project);
    setLoadingModrinthVersions(true);
    setSelectedModrinthVersion(null);
    try {
      const versions = await sendIPCCommand<ModrinthVersionInfo[]>('modrinth.project.versions', {
        project_id: project.project_id,
      });
      setModrinthVersions(versions || []);
      if ((versions || []).length > 0) {
        handleSelectModrinthVersion((versions || [])[0]);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingModrinthVersions(false);
    }
  }

  function handleSelectModrinthVersion(version: ModrinthVersionInfo) {
    setSelectedModrinthVersion(version);
    setVersions(version.game_versions.length > 0 ? version.game_versions : []);
    setForm((prev) => ({
      ...prev,
      server_type: (version.loaders[0] || prev.server_type) as typeof prev.server_type,
      mc_version: version.game_versions[0] || prev.mc_version,
    }));
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const selectedLoader = selectedModrinthVersion?.loaders[0] || form.server_type;
      await sendIPCCommand('server.create', {
        name: form.name,
        server_type: selectedLoader,
        mc_version: form.mc_version,
        memory_min_mb: form.memory_min_mb,
        memory_max_mb: form.memory_max_mb,
        port: form.auto_port ? undefined : form.port,
        auto_port: form.auto_port,
        max_players: 20,
        motd: form.name,
        gamemode: 'survival',
        difficulty: 'normal',
        loader: selectedLoader,
        modrinth_project_id: selectedModrinthProject?.project_id,
        modrinth_version_id: selectedModrinthVersion?.id,
      });
      onCreated();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">Create Server</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              placeholder="My Server"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-2">Server Engine (Sunucu Motoru)</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, server_type: 'vanilla' });
                  setSelectedModrinthProject(null);
                  setSelectedModrinthVersion(null);
                  setModrinthVersions([]);
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
                  form.server_type === 'vanilla'
                    ? 'bg-emerald-600/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                    : 'bg-gray-800/40 border-gray-700 hover:border-gray-650 text-gray-400 hover:text-gray-300'
                }`}
              >
                <Sparkles className={`w-5 h-5 mb-1.5 ${form.server_type === 'vanilla' ? 'text-emerald-400' : 'text-gray-500'}`} />
                <span className="text-xs font-bold block">Vanilla</span>
                <span className="text-[10px] mt-1 leading-tight text-gray-500">Orijinal Minecraft motoru. Modsuz deneyim.</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setForm({ ...form, server_type: 'paper' });
                  setSelectedModrinthProject(null);
                  setSelectedModrinthVersion(null);
                  setModrinthVersions([]);
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
                  form.server_type === 'paper'
                    ? 'bg-emerald-600/10 border-emerald-500 text-white shadow-lg shadow-emerald-500/10'
                    : 'bg-gray-800/40 border-gray-700 hover:border-gray-650 text-gray-400 hover:text-gray-300'
                }`}
              >
                <Zap className={`w-5 h-5 mb-1.5 ${form.server_type === 'paper' ? 'text-emerald-400' : 'text-gray-500'}`} />
                <span className="text-xs font-bold block">PaperMC</span>
                <span className="text-[10px] mt-1 leading-tight text-gray-500">Yüksek performans, TPS optimizasyonu ve eklenti desteği.</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Version (Sürüm)</label>
              {loadingVersions ? (
                <div className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm flex items-center justify-between text-gray-400">
                  <span>Sürümler alınıyor...</span>
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <select
                  value={form.mc_version}
                  onChange={(e) => setForm({ ...form, mc_version: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {versions.map((v) => (
                    <option key={v} value={v} className="bg-gray-850 text-white">
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Port</label>
              <div className="space-y-2">
                <input
                  type="number"
                  value={form.port}
                  disabled={form.auto_port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                />
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_port}
                    onChange={(e) => setForm({ ...form, auto_port: e.target.checked })}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-emerald-500"
                  />
                  Auto-assign a free port
                </label>
              </div>
            </div>
          </div>

          <div className="border border-gray-700 rounded-xl p-4 space-y-4 bg-gray-900/40">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Modrinth Modpack</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modrinthQuery}
                  onChange={(e) => setModrinthQuery(e.target.value)}
                  placeholder="Search modpacks..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleSearchModrinth}
                  disabled={searchingModrinth || !modrinthQuery.trim()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 rounded-lg text-sm flex items-center gap-2"
                >
                  {searchingModrinth ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search
                </button>
              </div>
            </div>

            {modrinthResults.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-auto pr-1">
                {modrinthResults.map((project) => (
                  <button
                    key={project.project_id}
                    onClick={() => handleSelectModrinthProject(project)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedModrinthProject?.project_id === project.project_id
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-100">{project.title}</div>
                    <div className="text-xs text-gray-400 line-clamp-2">{project.description}</div>
                  </button>
                ))}
              </div>
            )}

            {selectedModrinthProject && (
              <div className="space-y-3 border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-200">{selectedModrinthProject.title}</div>
                    <div className="text-xs text-gray-400">Select a pack version</div>
                  </div>
                  {loadingModrinthVersions && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                </div>
                {selectedModrinthVersion && (
                  <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                    Selected: {selectedModrinthVersion.name} • {selectedModrinthVersion.game_versions[0] || 'unknown MC version'}
                  </div>
                )}
                <div className="space-y-2 max-h-48 overflow-auto pr-1">
                  {modrinthVersions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => handleSelectModrinthVersion(version)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedModrinthVersion?.id === version.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-100">{version.name}</div>
                      <div className="text-xs text-gray-400">
                        MC {version.game_versions[0] || 'unknown'} • {version.loaders.join(', ') || 'unknown loader'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Min RAM (MB)</label>
              <input
                type="number"
                value={form.memory_min_mb}
                onChange={(e) => setForm({ ...form, memory_min_mb: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max RAM (MB)</label>
              <input
                type="number"
                value={form.memory_max_mb}
                onChange={(e) => setForm({ ...form, memory_max_mb: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !form.name.trim()}
            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded-lg transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
