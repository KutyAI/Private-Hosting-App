import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppSettingsSnapshot, NotificationEventType, NotificationSettings } from '@mc-host/shared-types';

const APP_SETTINGS_KEY = 'app';
const NOTIFICATION_SETTINGS_KEY = 'notifications';
const DEFAULT_MAX_CONCURRENT_INSTANCES = 3;
const DEFAULT_NOTIFICATION_EVENTS: Record<NotificationEventType, boolean> = {
  'server.started': true,
  'server.stopped': true,
  'server.crashed': true,
  'player.joined': true,
  'player.left': true,
  'backup.completed': true,
};

function createDefaultNotificationSettings(): NotificationSettings {
  return {
    webhook_url: '',
    enabled: false,
    username: undefined,
    avatar_url: undefined,
    enabled_events: { ...DEFAULT_NOTIFICATION_EVENTS },
  };
}

function createDefaultAppSettings(): AppSettingsSnapshot {
  return {
    maxConcurrentInstances: DEFAULT_MAX_CONCURRENT_INSTANCES,
    useRustProxy: false,
  };
}

export class SettingsStore {
  private db: Database.Database;
  private encryptionKey: Buffer;

  constructor(private configDir: string) {
    fs.mkdirSync(configDir, { recursive: true });

    const dbPath = path.join(configDir, 'settings.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.encryptionKey = this.loadOrCreateKey();
  }

  getNotificationSettings(): NotificationSettings {
    const stored = this.getJsonValue<Partial<NotificationSettings>>(NOTIFICATION_SETTINGS_KEY);
    return this.normalizeNotificationSettings(stored);
  }

  saveNotificationSettings(settings: NotificationSettings): void {
    this.setJsonValue(NOTIFICATION_SETTINGS_KEY, this.normalizeNotificationSettings(settings));
  }

  getAppSettings(): AppSettingsSnapshot {
    const stored = this.getJsonValue<Partial<AppSettingsSnapshot>>(APP_SETTINGS_KEY);
    const defaults = createDefaultAppSettings();

    return {
      maxConcurrentInstances: this.clampConcurrentInstances(
        stored?.maxConcurrentInstances ?? defaults.maxConcurrentInstances
      ),
      useRustProxy: stored?.useRustProxy ?? defaults.useRustProxy,
    };
  }

  updateAppSettings(updates: Partial<AppSettingsSnapshot>): AppSettingsSnapshot {
    const next = {
      ...this.getAppSettings(),
      ...updates,
    };
    next.maxConcurrentInstances = this.clampConcurrentInstances(next.maxConcurrentInstances);
    this.setJsonValue(APP_SETTINGS_KEY, next);
    return next;
  }

  getMaxConcurrentInstances(): number {
    return this.getAppSettings().maxConcurrentInstances;
  }

  setMaxConcurrentInstances(maxConcurrentInstances: number): AppSettingsSnapshot {
    return this.updateAppSettings({ maxConcurrentInstances });
  }

  getUseRustProxy(): boolean {
    return this.getAppSettings().useRustProxy;
  }

  setUseRustProxy(useRustProxy: boolean): AppSettingsSnapshot {
    return this.updateAppSettings({ useRustProxy });
  }

  private clampConcurrentInstances(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_MAX_CONCURRENT_INSTANCES;
    }

    return Math.min(Math.max(Math.floor(value), 1), 20);
  }

  private normalizeNotificationSettings(
    settings: Partial<NotificationSettings> | null | undefined,
  ): NotificationSettings {
    const defaults = createDefaultNotificationSettings();
    const enabledEvents = { ...defaults.enabled_events, ...(settings?.enabled_events || {}) };

    return {
      webhook_url: settings?.webhook_url?.trim() || '',
      enabled: settings?.enabled ?? false,
      username: settings?.username?.trim() || undefined,
      avatar_url: settings?.avatar_url?.trim() || undefined,
      enabled_events: enabledEvents,
    };
  }

  private getJsonValue<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row?.value) {
      return null;
    }

    try {
      const decoded = this.decrypt(row.value);
      return JSON.parse(decoded) as T;
    } catch (error) {
      console.warn(`[settings] Failed to read key ${key}:`, error);
      return null;
    }
  }

  private setJsonValue(key: string, value: unknown): void {
    const encrypted = this.encrypt(JSON.stringify(value));
    this.db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, encrypted, new Date().toISOString());
  }

  private loadOrCreateKey(): Buffer {
    const keyPath = path.join(this.configDir, 'settings.key');

    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath, 'utf-8').trim();
      const buffer = Buffer.from(existing, 'base64');
      if (buffer.length === 32) {
        return buffer;
      }
    }

    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 });
    return key;
  }

  private encrypt(plainText: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  private decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid encrypted payload');
    }

    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
