import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { sendIPCCommand } from '../../services/ipcClient';
import type { LogEntry } from '@mc-host/shared-types';

export function Console() {
  const { selectedServer, logs, addLog } = useAppStore();
  const [command, setCommand] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedServer) return;

    sendIPCCommand<LogEntry[]>('server.logs.stream', { server_id: selectedServer, limit: 500 })
      .then((entries) => {
        entries.forEach((entry) => addLog(selectedServer, entry));
      })
      .catch(() => {});
  }, [selectedServer]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, selectedServer]);

  const handleSendCommand = useCallback(async () => {
    if (!selectedServer || !command.trim()) return;
    try {
      await sendIPCCommand('server.command.send', { server_id: selectedServer, command: command.trim() });
      setCommand('');
    } catch (err: any) {
      alert(err.message);
    }
  }, [selectedServer, command]);

  const serverLogs = selectedServer ? logs[selectedServer] || [] : [];

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold mb-4">Console</h2>

      {!selectedServer ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Select a server from the Dashboard to view its console
        </div>
      ) : (
        <>
          <div className="flex-1 bg-black rounded-lg p-4 font-mono text-sm overflow-auto min-h-0">
            {serverLogs.length === 0 ? (
              <div className="text-gray-500">No logs yet...</div>
            ) : (
              serverLogs.map((log, i) => (
                <div
                  key={i}
                  className={`py-0.5 ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-yellow-400' :
                    log.level === 'debug' ? 'text-gray-500' :
                    'text-gray-300'
                  }`}
                >
                  <span className="text-gray-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {log.message}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendCommand()}
              placeholder="Enter command..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSendCommand}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
