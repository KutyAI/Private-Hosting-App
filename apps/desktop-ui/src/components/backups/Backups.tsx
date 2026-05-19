import { useState, useEffect } from 'react';
import { Download, RotateCcw, Trash2, Clock, Play } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { sendIPCCommand } from '../../services/ipcClient';
import type { BackupRecord } from '@mc-host/shared-types';

interface BackupSchedule {
  serverId: string;
  intervalHours: number;
  maxBackups: number;
  enabled: boolean;
  lastBackup: string | null;
}

export function Backups() {
  const { selectedServer } = useAppStore();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    intervalHours: 6,
    maxBackups: 10,
    enabled: true,
  });

  useEffect(() => {
    if (selectedServer) {
      loadBackups();
      loadSchedule();
    }
  }, [selectedServer]);

  async function loadBackups() {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const list = await sendIPCCommand<BackupRecord[]>('backup.list', { server_id: selectedServer });
      setBackups((list || []).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSchedule() {
    if (!selectedServer) return;
    try {
      const s = await sendIPCCommand<BackupSchedule>('backup.schedule.get', { server_id: selectedServer });
      setSchedule(s);
      if (s) {
        setScheduleForm({
          intervalHours: s.intervalHours,
          maxBackups: s.maxBackups,
          enabled: s.enabled,
        });
      }
    } catch {}
  }

  async function handleCreateBackup() {
    if (!selectedServer) return;
    try {
      await sendIPCCommand('backup.create', { server_id: selectedServer });
      loadBackups();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleRestore(backupId: string) {
    if (!selectedServer) return;
    if (!confirm('Restore this backup? Current world data will be backed up first.')) return;
    try {
      await sendIPCCommand('backup.restore', { server_id: selectedServer, backup_id: backupId });
      loadBackups();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteBackup(backupId: string) {
    if (!confirm('Delete this backup?')) return;
    try {
      await sendIPCCommand('backup.delete', { server_id: selectedServer, backup_id: backupId });
      loadBackups();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleSaveSchedule() {
    if (!selectedServer) return;
    try {
      await sendIPCCommand('backup.schedule.set', {
        server_id: selectedServer,
        ...scheduleForm,
      });
      loadSchedule();
      setShowSchedule(false);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleRemoveSchedule() {
    if (!selectedServer) return;
    try {
      await sendIPCCommand('backup.schedule.remove', { server_id: selectedServer });
      setSchedule(null);
      setShowSchedule(false);
    } catch (err: any) {
      alert(err.message);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Backups</h2>

      {!selectedServer ? (
        <div className="text-gray-400 text-center py-8">
          Select a server from the Dashboard to manage backups
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateBackup}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Create Backup
            </button>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                schedule?.enabled
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <Clock className="w-4 h-4" />
              {schedule?.enabled ? `Scheduled: every ${schedule.intervalHours}h` : 'Schedule'}
            </button>
          </div>

          {showSchedule && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Backup Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Interval (hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={scheduleForm.intervalHours}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, intervalHours: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Backups</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={scheduleForm.maxBackups}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, maxBackups: parseInt(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 p-2 bg-gray-700 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.enabled}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })}
                      className="w-4 h-4 rounded bg-gray-600 border-gray-500 text-emerald-500"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveSchedule} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm">
                  Save Schedule
                </button>
                {schedule && (
                  <button onClick={handleRemoveSchedule} className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg text-sm">
                    Remove Schedule
                  </button>
                )}
              </div>
              {schedule?.lastBackup && (
                <p className="mt-3 text-sm text-gray-400">
                  Last backup: {new Date(schedule.lastBackup).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-gray-400">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="text-gray-400 text-center py-8">No backups yet</div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup) => (
                <div key={backup.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${backup.source === 'scheduled' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                    <div>
                      <div className="font-medium">
                        {new Date(backup.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-400">
                        {formatBytes(backup.size_bytes)} • {backup.source}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(backup.id)}
                      className="p-2 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteBackup(backup.id)}
                      className="p-2 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
