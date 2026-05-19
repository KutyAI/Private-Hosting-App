import { useState, useEffect } from 'react';
import { Activity, Wifi, HardDrive, Cpu, Globe, Server, RefreshCw } from 'lucide-react';
import { sendIPCCommand } from '../../services/ipcClient';
import { useAppStore } from '../../stores/appStore';

interface DiagnosticsData {
  natType: string;
  candidates: number;
  publicAddresses: string[];
  localAddresses: string[];
  networkInterfaces: string[];
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  uptime: number;
  platform: string;
  nodeVersion: string;
}

interface ConnectivityTest {
  name: string;
  address: string;
  port: number;
  status: 'pending' | 'testing' | 'success' | 'failed';
}

export function Diagnostics() {
  const { selectedServer } = useAppStore();
  const [diagData, setDiagData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectivityTests, setConnectivityTests] = useState<ConnectivityTest[]>([
    { name: 'Google STUN', address: 'stun.l.google.com', port: 19302, status: 'pending' },
    { name: 'Cloudflare STUN', address: 'stun.cloudflare.com', port: 3478, status: 'pending' },
    { name: 'Mojang API', address: 'launchermeta.mojang.com', port: 443, status: 'pending' },
    { name: 'PaperMC API', address: 'api.papermc.io', port: 443, status: 'pending' },
  ]);

  useEffect(() => {
    runDiagnostics();
  }, []);

  async function runDiagnostics() {
    setLoading(true);
    try {
      const result = await sendIPCCommand<DiagnosticsData>('network.diagnostics', {});
      setDiagData(result);
    } catch (err: any) {
      console.error('Diagnostics failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runConnectivityTests() {
    const updated = [...connectivityTests];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: 'testing' };
      setConnectivityTests([...updated]);

      try {
        const result = await sendIPCCommand<{ reachable: boolean }>('network.test.connectivity', {
          address: updated[i].address,
          port: updated[i].port,
          timeout: 5000,
        });
        updated[i] = { ...updated[i], status: result.reachable ? 'success' : 'failed' };
      } catch {
        updated[i] = { ...updated[i], status: 'failed' };
      }

      setConnectivityTests([...updated]);
    }
  }

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Diagnostics</h2>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold">Network Status</h3>
          </div>
          {diagData ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">NAT Type</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  diagData.natType === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                  diagData.natType === 'restricted' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {diagData.natType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Candidates</span>
                <span>{diagData.candidates}</span>
              </div>
              {diagData.publicAddresses.length > 0 && (
                <div>
                  <span className="text-gray-400 text-sm">Public Addresses</span>
                  <div className="mt-1 space-y-1">
                    {diagData.publicAddresses.map((addr, i) => (
                      <div key={i} className="text-sm font-mono bg-gray-900 px-2 py-1 rounded">{addr}</div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-gray-400 text-sm">Local Addresses</span>
                <div className="mt-1 space-y-1">
                  {diagData.localAddresses.map((addr, i) => (
                    <div key={i} className="text-sm font-mono bg-gray-900 px-2 py-1 rounded">{addr}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">{loading ? 'Loading...' : 'No data'}</div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold">System Info</h3>
          </div>
          {diagData ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Platform</span>
                <span>{diagData.platform}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Node.js</span>
                <span>{diagData.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Uptime</span>
                <span>{formatUptime(diagData.uptime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Memory (RSS)</span>
                <span>{diagData.memoryUsage.rss} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Heap Used</span>
                <span>{diagData.memoryUsage.heapUsed} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Heap Total</span>
                <span>{diagData.memoryUsage.heapTotal} MB</span>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">{loading ? 'Loading...' : 'No data'}</div>
          )}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold">Connectivity Tests</h3>
          </div>
          <button
            onClick={runConnectivityTests}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Activity className="w-4 h-4" />
            Run Tests
          </button>
        </div>
        <div className="space-y-2">
          {connectivityTests.map((test, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <span>{test.name}</span>
              <span className={`px-2 py-1 rounded text-xs ${
                test.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                test.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                test.status === 'testing' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-600 text-gray-300'
              }`}>
                {test.status === 'testing' ? 'Testing...' : test.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {selectedServer && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold">Server Diagnostics</h3>
          </div>
          <p className="text-gray-400 text-sm">
            Detailed diagnostics for server {selectedServer}.
          </p>
        </div>
      )}
    </div>
  );
}
