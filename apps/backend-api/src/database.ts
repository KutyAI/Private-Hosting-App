import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'mc-hosting.db');

export function getDatabase(): Database.Database {
  const dataDir = path.dirname(DB_PATH);
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_public_key TEXT,
      device_name TEXT NOT NULL,
      platform TEXT DEFAULT 'windows',
      app_version TEXT DEFAULT '0.2.0',
      registered_at TEXT DEFAULT (datetime('now')),
      last_online_at TEXT DEFAULT (datetime('now')),
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester_user_id TEXT NOT NULL REFERENCES users(id),
      addressee_user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      accepted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      host_user_id TEXT NOT NULL REFERENCES users(id),
      host_device_id TEXT NOT NULL REFERENCES devices(id),
      server_id TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      max_uses INTEGER DEFAULT 10,
      current_uses INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS server_registrations (
      id TEXT PRIMARY KEY,
      host_device_id TEXT NOT NULL REFERENCES devices(id),
      local_server_slug TEXT NOT NULL,
      mc_version TEXT NOT NULL,
      server_type TEXT DEFAULT 'vanilla',
      visibility TEXT DEFAULT 'private',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS presence (
      device_id TEXT PRIMARY KEY REFERENCES devices(id),
      online INTEGER DEFAULT 0,
      server_status TEXT DEFAULT 'offline',
      player_count INTEGER DEFAULT 0,
      direct_candidate_info TEXT,
      relay_capability INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relay_allocations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      host_device_id TEXT NOT NULL,
      guest_device_id TEXT NOT NULL,
      allocated_at TEXT DEFAULT (datetime('now')),
      released_at TEXT,
      bytes_in INTEGER DEFAULT 0,
      bytes_out INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      target_type TEXT,
      target_id TEXT,
      event_type TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}
