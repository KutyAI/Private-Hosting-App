import * as fs from 'fs';
import * as path from 'path';
import { BackupManager } from './backup-manager';
import { ServerManager } from './server-manager';

export interface BackupSchedule {
  serverId: string;
  intervalHours: number;
  maxBackups: number;
  enabled: boolean;
  lastBackup: string | null;
}

export class BackupScheduler {
  private schedules: Map<string, BackupSchedule> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private schedulesPath: string;
  private backupManager: BackupManager;
  private serverManager: ServerManager;

  constructor(dataDir: string, backupManager: BackupManager, serverManager: ServerManager) {
    this.schedulesPath = path.join(dataDir, 'config', 'backup-schedules.json');
    this.backupManager = backupManager;
    this.serverManager = serverManager;
    this.loadSchedules();
  }

  loadSchedules(): void {
    try {
      if (fs.existsSync(this.schedulesPath)) {
        const data = JSON.parse(fs.readFileSync(this.schedulesPath, 'utf-8'));
        for (const [key, schedule] of Object.entries(data)) {
          this.schedules.set(key, schedule as BackupSchedule);
        }
      }
    } catch {}
  }

  saveSchedules(): void {
    const obj: Record<string, BackupSchedule> = {};
    for (const [key, schedule] of this.schedules) {
      obj[key] = schedule;
    }
    fs.writeFileSync(this.schedulesPath, JSON.stringify(obj, null, 2));
  }

  setSchedule(schedule: BackupSchedule): void {
    this.schedules.set(schedule.serverId, schedule);
    this.saveSchedules();
    this.startSchedule(schedule);
  }

  getSchedule(serverId: string): BackupSchedule | null {
    return this.schedules.get(serverId) || null;
  }

  listSchedules(): BackupSchedule[] {
    return Array.from(this.schedules.values());
  }

  removeSchedule(serverId: string): void {
    this.schedules.delete(serverId);
    this.saveSchedules();
    this.stopSchedule(serverId);
  }

  startAll(): void {
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled) {
        this.startSchedule(schedule);
      }
    }
  }

  stopAll(): void {
    for (const serverId of this.timers.keys()) {
      this.stopSchedule(serverId);
    }
  }

  private startSchedule(schedule: BackupSchedule): void {
    this.stopSchedule(schedule.serverId);

    if (!schedule.enabled) return;

    const intervalMs = schedule.intervalHours * 60 * 60 * 1000;

    this.timers.set(schedule.serverId, setInterval(async () => {
      await this.runBackup(schedule);
    }, intervalMs));

    console.log(`Backup schedule started for ${schedule.serverId}: every ${schedule.intervalHours}h`);
  }

  private stopSchedule(serverId: string): void {
    const timer = this.timers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(serverId);
    }
  }

  private async runBackup(schedule: BackupSchedule): Promise<void> {
    try {
      console.log(`Running scheduled backup for ${schedule.serverId}`);

      const backups = this.backupManager.listBackups(schedule.serverId);
      if (backups.length >= schedule.maxBackups) {
        const oldest = backups.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0];
        if (oldest) {
          this.backupManager.deleteBackup(schedule.serverId, oldest.id);
        }
      }

      const serverConfig = this.serverManager.getServerConfig(schedule.serverId);
      if (!serverConfig) {
        console.error(`Server ${schedule.serverId} not found for backup`);
        return;
      }

      const serverDir = path.join(process.env.APPDATA || '', 'MCHosting', 'servers', schedule.serverId);
      await this.backupManager.createBackup(schedule.serverId, serverDir, 'scheduled');

      const updated = this.schedules.get(schedule.serverId);
      if (updated) {
        updated.lastBackup = new Date().toISOString();
        this.schedules.set(schedule.serverId, updated);
        this.saveSchedules();
      }

      console.log(`Scheduled backup completed for ${schedule.serverId}`);
    } catch (err) {
      console.error(`Scheduled backup failed for ${schedule.serverId}:`, err);
    }
  }
}
