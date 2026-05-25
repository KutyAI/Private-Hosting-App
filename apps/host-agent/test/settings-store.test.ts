import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SettingsStore } from '../src/settings-store';

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `mc-host-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('SettingsStore', () => {
  let dir: string;
  let store: SettingsStore;

  beforeEach(() => {
    dir = makeTempDir();
    store = new SettingsStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns defaults when nothing has been saved', () => {
    const app = store.getAppSettings();
    expect(app.maxConcurrentInstances).toBe(3);
    expect(app.useRustProxy).toBe(false);

    const notif = store.getNotificationSettings();
    expect(notif.enabled).toBe(false);
    expect(notif.webhook_url).toBe('');
    expect(notif.enabled_events['server.started']).toBe(true);
  });

  it('persists and reloads app settings', () => {
    store.updateAppSettings({ maxConcurrentInstances: 5, useRustProxy: true });
    const store2 = new SettingsStore(dir);
    const app = store2.getAppSettings();
    expect(app.maxConcurrentInstances).toBe(5);
    expect(app.useRustProxy).toBe(true);
  });

  it('clamps maxConcurrentInstances to 1-20', () => {
    store.setMaxConcurrentInstances(0);
    expect(store.getMaxConcurrentInstances()).toBe(1);

    store.setMaxConcurrentInstances(999);
    expect(store.getMaxConcurrentInstances()).toBe(20);
  });

  it('persists and reloads notification settings', () => {
    store.saveNotificationSettings({
      webhook_url: 'https://discord.com/api/webhooks/test',
      enabled: true,
      username: 'Bot',
      avatar_url: undefined,
      enabled_events: {
        'server.started': true,
        'server.stopped': false,
        'server.crashed': true,
        'player.joined': false,
        'player.left': false,
        'backup.completed': true,
      },
    });

    const store2 = new SettingsStore(dir);
    const notif = store2.getNotificationSettings();
    expect(notif.enabled).toBe(true);
    expect(notif.webhook_url).toBe('https://discord.com/api/webhooks/test');
    expect(notif.username).toBe('Bot');
    expect(notif.enabled_events['server.stopped']).toBe(false);
    expect(notif.enabled_events['server.crashed']).toBe(true);
  });

  it('survives corrupt encrypted data gracefully', () => {
    const dbPath = path.join(dir, 'settings.db');
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    db.prepare(`INSERT OR REPLACE INTO settings VALUES (?, ?, ?)`).run('app', 'corrupted-data', new Date().toISOString());
    db.close();

    const store2 = new SettingsStore(dir);
    const app = store2.getAppSettings();
    expect(app.maxConcurrentInstances).toBe(3);
  });
});
