import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { sendIPCCommand } from '../../services/ipcClient';

export function Settings() {
  const { servers, selectedServer } = useAppStore();
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = servers.find(s => s.id === selectedServer);

  useEffect(() => {
    if (selectedServer) {
      loadProperties();
    }
  }, [selectedServer]);

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

  if (!selectedServer) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Server Settings</h2>
        <div className="text-gray-400 text-center py-8">
          Select a server from the Dashboard to edit its settings
        </div>
      </div>
    );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Server Settings</h2>
        {selected && (
          <span className="text-gray-400">{selected.name}</span>
        )}
      </div>

      {saved && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
          Settings saved successfully
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">General</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {textProps.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">{label}</label>
                <input
                  type="text"
                  value={properties[key] || ''}
                  onChange={(e) => updateProp(key, e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            ))}
            {numberProps.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">{label}</label>
                <input
                  type="number"
                  value={properties[key] || ''}
                  onChange={(e) => updateProp(key, e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            ))}
            {selectProps.map(({ key, label, options }) => (
              <div key={key}>
                <label className="block text-sm text-gray-400 mb-1">{label}</label>
                <select
                  value={properties[key] || options[0]}
                  onChange={(e) => updateProp(key, e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                >
                  {options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Toggles</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {boolProps.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
                <input
                  type="checkbox"
                  checked={properties[key] === 'true'}
                  onChange={(e) => updateProp(key, e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 rounded bg-gray-600 border-gray-500 text-emerald-500 focus:ring-emerald-500"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
