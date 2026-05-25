import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import extractZip from 'extract-zip';
import { BackupRecord } from '@mc-host/shared-types';
import { v4 as uuidv4 } from 'uuid';

export class BackupManager extends EventEmitter {
  private dataDir: string;

  constructor(dataDir: string) {
    super();
    this.dataDir = dataDir;
  }

  async createBackup(serverId: string, serverDir: string, source: 'manual' | 'scheduled' = 'manual'): Promise<BackupRecord> {
    const backupsDir = path.join(this.dataDir, 'backups', serverId);
    fs.mkdirSync(backupsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `${timestamp}.zip`);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(backupFile);
      const archive = archiver.create('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(serverDir, serverId);
      archive.finalize();
    });

    const stats = fs.statSync(backupFile);
    const checksum = this.calculateChecksum(backupFile);

    const record: BackupRecord = {
      id: uuidv4(),
      server_id: serverId,
      file_path: backupFile,
      size_bytes: stats.size,
      checksum,
      created_at: new Date().toISOString(),
      source,
    };

    this.saveBackupRecord(serverId, record);
    this.emit('completed', record);
    return record;
  }

  async restoreBackup(serverId: string, backupId: string, serverDir: string): Promise<void> {
    const record = this.getBackupRecord(serverId, backupId);
    if (!record) {
      throw new Error('Backup not found');
    }

    if (!fs.existsSync(record.file_path)) {
      throw new Error('Backup file not found on disk');
    }

    const tempRestoreDir = path.join(this.dataDir, 'temp', `restore-${serverId}`);
    if (fs.existsSync(tempRestoreDir)) {
      fs.rmSync(tempRestoreDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRestoreDir, { recursive: true });

    await extractZip(record.file_path, { dir: tempRestoreDir });

    const extractedServerDir = path.join(tempRestoreDir, serverId);
    if (!fs.existsSync(extractedServerDir)) {
      throw new Error('Invalid backup archive structure');
    }

    if (fs.existsSync(serverDir)) {
      const backupOldDir = serverDir + '.old';
      if (fs.existsSync(backupOldDir)) {
        fs.rmSync(backupOldDir, { recursive: true, force: true });
      }
      fs.renameSync(serverDir, backupOldDir);
    }

    fs.renameSync(extractedServerDir, serverDir);

    fs.rmSync(tempRestoreDir, { recursive: true, force: true });
  }

  listBackups(serverId: string): BackupRecord[] {
    const recordsPath = path.join(this.dataDir, 'backups', serverId, 'records.json');
    if (!fs.existsSync(recordsPath)) return [];
    
    try {
      return JSON.parse(fs.readFileSync(recordsPath, 'utf-8')) as BackupRecord[];
    } catch {
      return [];
    }
  }

  deleteBackup(serverId: string, backupId: string): void {
    const record = this.getBackupRecord(serverId, backupId);
    if (record) {
      if (fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
      }
      
      const records = this.listBackups(serverId);
      const filtered = records.filter(r => r.id !== backupId);
      this.saveBackupRecords(serverId, filtered);
    }
  }

  private getBackupRecord(serverId: string, backupId: string): BackupRecord | null {
    const records = this.listBackups(serverId);
    return records.find(r => r.id === backupId) || null;
  }

  private saveBackupRecord(serverId: string, record: BackupRecord): void {
    const records = this.listBackups(serverId);
    records.push(record);
    this.saveBackupRecords(serverId, records);
  }

  private saveBackupRecords(serverId: string, records: BackupRecord[]): void {
    const recordsPath = path.join(this.dataDir, 'backups', serverId, 'records.json');
    const dir = path.dirname(recordsPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
  }

  private calculateChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }
}
