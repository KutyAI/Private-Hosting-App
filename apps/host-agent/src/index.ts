// Fix Turkish locale case-folding bug breaking ASCII HTTP headers (e.g. x-client-info -> x-client-ınfo)
String.prototype.toLocaleLowerCase = function (this: string) {
  return this.toLowerCase();
};
String.prototype.toLocaleUpperCase = function (this: string) {
  return this.toUpperCase();
};

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createClient } from '@supabase/supabase-js';
import { ServerManager } from './server-manager';
import { BackupManager } from './backup-manager';
import { BackupScheduler } from './backup-scheduler';
import { AuthManager } from './auth-manager';
import { PolicyEnforcer } from './policy-enforcer';
import { ConnectionProxy } from './connection-proxy';
import { IPCServer } from './ipc-server';
import { PresenceManager } from './presence-manager';
import { NatTraversal } from './nat-traversal';

const DATA_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'MCHosting'
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hmmfmgelowozwzapxwlm.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtbWZtZ2Vsb3dvend6YXB4d2xtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDAyODcsImV4cCI6MjA5MDgxNjI4N30.mP41IkhZDwxL1OWBcHMF2exklpK_ChlmZIft8Sr4Ono';

async function main() {
  console.log('MC Hosting Agent starting...');
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'config'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'servers'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'temp'), { recursive: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const serverManager = new ServerManager(DATA_DIR);
  const backupManager = new BackupManager(DATA_DIR);
  const backupScheduler = new BackupScheduler(DATA_DIR, backupManager, serverManager);
  const authManager = new AuthManager(path.join(DATA_DIR, 'config'));
  const policyEnforcer = new PolicyEnforcer(DATA_DIR);
  const natTraversal = new NatTraversal();

  serverManager.listServers().forEach(server => {
    if (server.status === 'running') {
      console.log(`Server ${server.id} was marked as running, status reset`);
    }
  });

  const connectionProxies: Map<string, ConnectionProxy> = new Map();

  const ipcServer = new IPCServer(serverManager, backupManager, backupScheduler, policyEnforcer, authManager, connectionProxies, supabase);
  const ipcPort = parseInt(process.env.IPC_PORT || '9876');
  ipcServer.start(ipcPort);

  serverManager.listServers().forEach(server => {
    const logListener = serverManager.onLog(server.id, (entry) => {
      ipcServer.broadcastLog(server.id, entry);
    });
  });

  backupScheduler.startAll();

  const candidates = await natTraversal.gatherCandidates();
  const srflx = candidates.filter((c: any) => c.type === 'srflx');
  const publicIp = srflx.length > 0 ? srflx[0].address : '';
  console.log(`NAT type: ${natTraversal.getNatType()}, candidates: ${candidates.length}`);
  if (publicIp) {
    console.log(`Public IP: ${publicIp}`);
  }

  let presenceManager: PresenceManager | null = null;
  const deviceId = authManager.getDeviceId();
  presenceManager = new PresenceManager({
    supabase,
    deviceId,
  });
  presenceManager.setNetworkInfo(publicIp, 25565, natTraversal.getNatType());
  presenceManager.start();
  console.log('Presence heartbeat started (Supabase)');

  process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    backupScheduler.stopAll();
    for (const proxy of connectionProxies.values()) {
      proxy.stop();
    }
    presenceManager?.stop();
    ipcServer.stop();
    setTimeout(() => process.exit(0), 2000);
  });

  process.on('SIGTERM', () => {
    console.log('\nSIGTERM received, shutting down gracefully...');
    backupScheduler.stopAll();
    for (const proxy of connectionProxies.values()) {
      proxy.stop();
    }
    presenceManager?.stop();
    ipcServer.stop();
    setTimeout(() => process.exit(0), 2000);
  });

  console.log(`Agent ready. IPC port: ${ipcPort}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
