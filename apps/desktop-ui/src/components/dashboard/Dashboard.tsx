import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Users, HardDrive, Cpu, Wifi, Trash2, Plus, Sparkles, Zap } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { connectIPC, sendIPCCommand, setConnectionStateHandler, disconnectIPC } from '../../services/ipcClient';
import type { LocalServer, ServerMetrics, LogEntry } from '@mc-host/shared-types';

export function Dashboard() {
  const { servers, selectedServer, setSelectedServer, metrics, setServers, updateMetrics, setConnected, isConnected, addLog } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Server
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Active Players" value={selectedMetrics?.player_count ?? 0} />
        <StatCard icon={Cpu} label="Memory" value={`${selectedMetrics?.memory_used_mb ?? 0} MB`} />
        <StatCard icon={HardDrive} label="Uptime" value={selectedMetrics ? `${Math.floor(selectedMetrics.uptime_seconds / 60)}m` : '--'} />
        <StatCard icon={Activity} label="TPS" value={selectedMetrics?.tps ?? '--'} />
      </div>

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
    server_type: 'vanilla' as 'vanilla' | 'paper',
    mc_version: '1.20.4',
    memory_min_mb: 1024,
    memory_max_mb: 2048,
    port: 25565,
  });
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await sendIPCCommand('server.create', {
        name: form.name,
        server_type: form.server_type,
        mc_version: form.mc_version,
        memory_min_mb: form.memory_min_mb,
        memory_max_mb: form.memory_max_mb,
        port: form.port,
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
                onClick={() => setForm({ ...form, server_type: 'vanilla' })}
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
                onClick={() => setForm({ ...form, server_type: 'paper' })}
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
              <label className="block text-sm text-gray-400 mb-1">Version</label>
              <input
                value={form.mc_version}
                onChange={(e) => setForm({ ...form, mc_version: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
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
