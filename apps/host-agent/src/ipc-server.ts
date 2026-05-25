import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  AppSettingsSnapshot,
  IPCRequest,
  IPCResponse,
  LogEntry,
  ModrinthInstallResult,
  ModrinthSearchResult,
  ModrinthVersionInfo,
  NotificationSettings,
  ServerCreateParams,
} from '@mc-host/shared-types';
import { ServerManager } from './server-manager';
import { BackupManager } from './backup-manager';
import { BackupScheduler } from './backup-scheduler';
import { PolicyEnforcer } from './policy-enforcer';
import { AuthManager } from './auth-manager';
import { NatTraversal } from './nat-traversal';
import { getInviteByCode, incrementInviteUsage, getHostDeviceInfo } from './supabase-client';
import { SettingsStore } from './settings-store';
import { NotificationService } from './notification-service';
import { JavaInstaller, resolveRequiredJavaVersion } from './java-installer';
import { ModrinthInstaller } from './modrinth-installer';
import { NoiseKeyStore } from './crypto/key-store';

export class IPCServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private natTraversal = new NatTraversal();
  private pingTimers: Map<WebSocket, NodeJS.Timeout> = new Map();
  private pingIntervals: Map<WebSocket, NodeJS.Timeout> = new Map();
  private readonly PING_INTERVAL = 15000;
  private readonly PING_TIMEOUT = 5000;

  constructor(
    private serverManager: ServerManager,
    private backupManager: BackupManager,
    private backupScheduler: BackupScheduler,
    private policyEnforcer: PolicyEnforcer,
    private authManager: AuthManager,
    private connectionProxies: Map<string, any> = new Map(),
    private supabase: SupabaseClient | null = null,
    private settingsStore: SettingsStore | null = null,
    private notificationService: NotificationService | null = null,
    private javaInstaller: JavaInstaller | null = null,
    private modrinthInstaller: ModrinthInstaller | null = null,
    private noiseKeyStore: NoiseKeyStore | null = null,
  ) {}

  start(port: number = 9876): void {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('pong', () => {
        const timer = this.pingTimers.get(ws);
        if (timer) clearTimeout(timer);
      });

      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const timeout = setTimeout(() => {
            ws.terminate();
            this.clients.delete(ws);
            this.pingTimers.delete(ws);
            this.pingIntervals.delete(ws);
          }, this.PING_TIMEOUT);
          this.pingTimers.set(ws, timeout);
          ws.ping();
        }
      }, this.PING_INTERVAL);
      this.pingIntervals.set(ws, pingInterval);

      ws.on('message', async (data) => {
        try {
          const request: IPCRequest = JSON.parse(data.toString());
          const response = await this.handleCommand(request);
          ws.send(JSON.stringify(response));
        } catch (err: any) {
          const errorResponse: IPCResponse = {
            id: 'unknown',
            success: false,
            error: err.message || 'Unknown error',
          };
          ws.send(JSON.stringify(errorResponse));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        const interval = this.pingIntervals.get(ws);
        if (interval) {
          clearInterval(interval);
          this.pingIntervals.delete(ws);
        }
        const timer = this.pingTimers.get(ws);
        if (timer) {
          clearTimeout(timer);
          this.pingTimers.delete(ws);
        }
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        this.clients.delete(ws);
        const interval = this.pingIntervals.get(ws);
        if (interval) {
          clearInterval(interval);
          this.pingIntervals.delete(ws);
        }
        const timer = this.pingTimers.get(ws);
        if (timer) {
          clearTimeout(timer);
          this.pingTimers.delete(ws);
        }
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`IPC server listening on ws://127.0.0.1:${port}`);
    });
  }

  broadcastLog(serverId: string, entry: LogEntry): void {
    const message = JSON.stringify({
      type: 'log',
      server_id: serverId,
      entry,
    });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private async handleCommand(request: IPCRequest): Promise<IPCResponse> {
    try {
      switch (request.command) {
        case 'server.create': {
          const params = request.params as Partial<ServerCreateParams> & { id?: string; auto_port?: boolean };
          const config = await this.serverManager.createServer({
            id: params.id || uuidv4(),
            name: params.name || 'New Server',
            server_type: params.server_type || 'vanilla',
            mc_version: params.mc_version || '1.20.4',
            world_path: 'world',
            memory_min_mb: params.memory_min_mb || 1024,
            memory_max_mb: params.memory_max_mb || 2048,
            auto_restart: params.auto_restart ?? true,
            port: params.port,
            auto_port: params.auto_port,
            max_players: params.max_players || 20,
            motd: params.motd || 'A Minecraft Server',
            gamemode: params.gamemode || 'survival',
            difficulty: params.difficulty || 'normal',
            java_path: params.java_path,
            loader: params.loader,
            modrinth_project_id: params.modrinth_project_id,
            modrinth_version_id: params.modrinth_version_id,
          });
          return { id: request.id, success: true, data: config };
        }

        case 'server.start': {
          await this.serverManager.startServer(request.params?.server_id as string);
          return { id: request.id, success: true };
        }

        case 'server.stop': {
          await this.serverManager.stopServer(request.params?.server_id as string);
          return { id: request.id, success: true };
        }

        case 'server.restart': {
          await this.serverManager.restartServer(request.params?.server_id as string);
          return { id: request.id, success: true };
        }

        case 'server.delete': {
          await this.serverManager.deleteServer(request.params?.server_id as string);
          return { id: request.id, success: true };
        }

        case 'server.list': {
          const servers = this.serverManager.listServers();
          return { id: request.id, success: true, data: servers };
        }

        case 'server.logs.stream': {
          const logs = this.serverManager.getLogs(
            request.params?.server_id as string,
            (request.params?.limit as number) || 200
          );
          return { id: request.id, success: true, data: logs };
        }

        case 'server.players.list': {
          const metrics = this.serverManager.getMetrics(request.params?.server_id as string);
          return { 
            id: request.id, 
            success: true, 
            data: { 
              count: metrics?.player_count || 0,
              max: metrics?.max_players || 20,
            } 
          };
        }

        case 'server.command.send': {
          const sent = this.serverManager.sendCommand(
            request.params?.server_id as string,
            request.params?.command as string
          );
          return { id: request.id, success: sent };
        }

        case 'server.metrics.get': {
          const metrics = this.serverManager.getMetrics(request.params?.server_id as string);
          return { id: request.id, success: true, data: metrics };
        }

        case 'server.properties.update': {
          await this.serverManager.updateProperties(
            request.params?.server_id as string,
            request.params?.properties as Record<string, string>
          );
          return { id: request.id, success: true };
        }

        case 'server.properties.get': {
          const config = this.serverManager.getServerConfig(request.params?.server_id as string);
          if (!config) {
            return { id: request.id, success: false, error: 'Server not found' };
          }
          const propsPath = require('path').join(
            require('path').join(this.serverManager['dataDir'], 'servers', request.params?.server_id),
            'server.properties'
          );
          let props: Record<string, string> = {};
          try {
            const fs = require('fs');
            if (fs.existsSync(propsPath)) {
              const content = fs.readFileSync(propsPath, 'utf-8');
              for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                  const eqIndex = trimmed.indexOf('=');
                  if (eqIndex > 0) {
                    props[trimmed.substring(0, eqIndex).trim()] = trimmed.substring(eqIndex + 1).trim();
                  }
                }
              }
            }
          } catch {}
          return { id: request.id, success: true, data: props };
        }

        case 'backup.create': {
          const serverId = request.params?.server_id as string;
          const serverDir = this.serverManager.getServerConfig(serverId);
          if (!serverDir) throw new Error('Server not found');
          
          const backup = await this.backupManager.createBackup(
            serverId,
            `servers/${serverId}`,
            (request.params?.source as any) || 'manual'
          );
          return { id: request.id, success: true, data: backup };
        }

        case 'backup.list': {
          const backups = this.backupManager.listBackups(request.params?.server_id as string);
          return { id: request.id, success: true, data: backups };
        }

        case 'backup.restore': {
          await this.backupManager.restoreBackup(
            request.params?.server_id as string,
            request.params?.backup_id as string,
            `servers/${request.params?.server_id}`
          );
          return { id: request.id, success: true };
        }

        case 'backup.delete': {
          this.backupManager.deleteBackup(
            request.params?.server_id as string,
            request.params?.backup_id as string
          );
          return { id: request.id, success: true };
        }

        case 'network.status': {
          return {
            id: request.id,
            success: true,
            data: {
              online: this.authManager.isLoggedIn(),
              device_id: this.authManager.getDeviceId(),
              device_name: this.authManager.getDeviceName(),
              noise_public_key: this.noiseKeyStore?.getPublicKeyHex() || null,
            }
          };
        }

        case 'settings.app.get': {
          if (!this.settingsStore) {
            return { id: request.id, success: false, error: 'Settings store not configured' };
          }
          return { id: request.id, success: true, data: this.settingsStore.getAppSettings() };
        }

        case 'settings.app.update': {
          if (!this.settingsStore) {
            return { id: request.id, success: false, error: 'Settings store not configured' };
          }
          const params = request.params as Partial<AppSettingsSnapshot>;
          return { id: request.id, success: true, data: this.settingsStore.updateAppSettings(params) };
        }

        case 'settings.notifications.get': {
          if (!this.settingsStore) {
            return { id: request.id, success: false, error: 'Settings store not configured' };
          }
          return { id: request.id, success: true, data: this.settingsStore.getNotificationSettings() };
        }

        case 'settings.notifications.update': {
          if (!this.settingsStore) {
            return { id: request.id, success: false, error: 'Settings store not configured' };
          }
          const params = request.params as Partial<NotificationSettings>;
          const current = this.settingsStore.getNotificationSettings();
          const next: NotificationSettings = {
            ...current,
            ...params,
            enabled_events: {
              ...current.enabled_events,
              ...(params.enabled_events || {}),
            },
          };
          this.settingsStore.saveNotificationSettings(next);
          return { id: request.id, success: true, data: next };
        }

        case 'settings.notifications.test': {
          if (!this.notificationService) {
            return { id: request.id, success: false, error: 'Notification service not configured' };
          }
          const ok = await this.notificationService.testWebhook();
          return { id: request.id, success: ok, data: { success: ok } };
        }

        case 'system.java.ensure': {
          if (!this.javaInstaller) {
            return { id: request.id, success: false, error: 'Java installer not configured' };
          }

          const params = request.params as { feature_version?: number; minecraft_version?: string };
          const featureVersion = params.feature_version || (params.minecraft_version ? resolveRequiredJavaVersion(params.minecraft_version) : 17);
          const installation = await this.javaInstaller.ensureJre(featureVersion);
          return { id: request.id, success: true, data: installation };
        }

        case 'system.environment.check': {
          const fs = require('fs');
          const path = require('path');
          const { execSync } = require('child_process');
          
          let javaInstalled = false;
          let javaVersion: string | null = null;
          let javaPath: string | null = null;
          
          try {
            const found = await this.serverManager['findJava']();
            if (found) {
              javaPath = found;
              javaInstalled = true;
              try {
                const versionOutput = execSync(`"${found}" -version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
                const combinedOutput = versionOutput.toString();
                const match = combinedOutput.match(/version "([^"]+)"/) || combinedOutput.match(/openjdk version "([^"]+)"/);
                if (match) {
                  javaVersion = match[1];
                } else {
                  javaVersion = 'Installed (Version Unknown)';
                }
              } catch (e: any) {
                const errStr = e.stderr?.toString() || e.message || '';
                const match = errStr.match(/version "([^"]+)"/) || errStr.match(/openjdk version "([^"]+)"/) || errStr.match(/java version "([^"]+)"/);
                if (match) {
                  javaVersion = match[1];
                } else {
                  javaVersion = 'Installed';
                }
              }
            }
          } catch {}

          let cloudflareInstalled = false;
          let cloudflareVersion: string | null = null;
          try {
            const cfOutput = execSync('cloudflared --version', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            if (cfOutput) {
              cloudflareInstalled = true;
              const match = cfOutput.match(/cloudflared version ([^\s,]+)/);
              cloudflareVersion = match ? match[1] : 'Installed';
            }
          } catch (e: any) {
            const errStr = e.stdout?.toString() || e.message || '';
            const match = errStr.match(/cloudflared version ([^\s,]+)/);
            if (match) {
              cloudflareInstalled = true;
              cloudflareVersion = match[1];
            }
          }

          const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
          const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
          
          const mcPath = path.join(appData, '.minecraft');
          const tlauncherPath = path.join(appData, 'tlauncher');
          const legacyLauncherPath = path.join(appData, 'Legacy-Launcher');
          const tlauncherUserPath = path.join(userProfile, '.tlauncher');

          const officialMinecraftInstalled = fs.existsSync(mcPath) && !fs.existsSync(tlauncherUserPath);
          const tlauncherInstalled = fs.existsSync(tlauncherUserPath) || fs.existsSync(tlauncherPath);
          const legacyLauncherInstalled = fs.existsSync(legacyLauncherPath);

          const mcVersions: string[] = [];
          const versionsDir = path.join(mcPath, 'versions');
          if (fs.existsSync(versionsDir)) {
            try {
              const dirs = fs.readdirSync(versionsDir);
              for (const dir of dirs) {
                if (fs.statSync(path.join(versionsDir, dir)).isDirectory()) {
                  mcVersions.push(dir);
                }
              }
            } catch {}
          }

          return {
            id: request.id,
            success: true,
            data: {
              java: {
                installed: javaInstalled,
                version: javaVersion,
                path: javaPath
              },
              cloudflare: {
                installed: cloudflareInstalled,
                version: cloudflareVersion
              },
              minecraft: {
                official: {
                  installed: officialMinecraftInstalled,
                  path: officialMinecraftInstalled ? mcPath : null
                },
                tlauncher: {
                  installed: tlauncherInstalled,
                  path: tlauncherInstalled ? (fs.existsSync(tlauncherUserPath) ? tlauncherUserPath : tlauncherPath) : null
                },
                legacy: {
                  installed: legacyLauncherInstalled,
                  path: legacyLauncherInstalled ? legacyLauncherPath : null
                },
                versions: mcVersions.slice(0, 15)
              }
            }
          };
        }

        case 'modrinth.search': {
          if (!this.modrinthInstaller) {
            return { id: request.id, success: false, error: 'Modrinth installer not configured' };
          }

          const params = request.params as { query?: string; limit?: number };
          const query = params.query?.trim();
          if (!query) {
            return { id: request.id, success: false, error: 'Search query is required' };
          }

          const results = await this.modrinthInstaller.searchModpacks(query, params.limit || 20);
          return { id: request.id, success: true, data: results };
        }

        case 'modrinth.project.versions': {
          if (!this.modrinthInstaller) {
            return { id: request.id, success: false, error: 'Modrinth installer not configured' };
          }

          const params = request.params as { project_id?: string };
          if (!params.project_id) {
            return { id: request.id, success: false, error: 'Project ID is required' };
          }

          const versions = await this.modrinthInstaller.getProjectVersions(params.project_id);
          return { id: request.id, success: true, data: versions };
        }

        case 'modrinth.version.get': {
          if (!this.modrinthInstaller) {
            return { id: request.id, success: false, error: 'Modrinth installer not configured' };
          }

          const params = request.params as { version_id?: string };
          if (!params.version_id) {
            return { id: request.id, success: false, error: 'Version ID is required' };
          }

          const version = await this.modrinthInstaller.getVersion(params.version_id);
          return { id: request.id, success: true, data: version };
        }

        case 'modrinth.install': {
          if (!this.modrinthInstaller) {
            return { id: request.id, success: false, error: 'Modrinth installer not configured' };
          }

          const params = request.params as {
            version_id?: string;
            target_dir?: string;
            java_path?: string;
          };

          if (!params.version_id || !params.target_dir) {
            return { id: request.id, success: false, error: 'Version ID and target directory are required' };
          }

          const result = await this.modrinthInstaller.installModrinthPack(
            params.version_id,
            params.target_dir,
            () => undefined,
            params.java_path,
          );
          return { id: request.id, success: true, data: result };
        }

        case 'network.invite.create': {
          return {
            id: request.id,
            success: true,
            data: {
              code: Math.random().toString(36).substring(2, 8).toUpperCase(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }
          };
        }

        case 'network.policy.update': {
          return { id: request.id, success: true };
        }

        case 'backup.schedule.set': {
          const params = request.params as any;
          this.backupScheduler.setSchedule({
            serverId: params.server_id,
            intervalHours: params.interval_hours || 6,
            maxBackups: params.max_backups || 10,
            enabled: params.enabled ?? true,
            lastBackup: null,
          });
          return { id: request.id, success: true, data: this.backupScheduler.getSchedule(params.server_id) };
        }

        case 'backup.schedule.get': {
          const schedule = this.backupScheduler.getSchedule(request.params?.server_id as string);
          return { id: request.id, success: true, data: schedule };
        }

        case 'backup.schedule.list': {
          return { id: request.id, success: true, data: this.backupScheduler.listSchedules() };
        }

        case 'backup.schedule.remove': {
          this.backupScheduler.removeSchedule(request.params?.server_id as string);
          return { id: request.id, success: true };
        }

        case 'network.diagnostics': {
          const candidates = await this.natTraversal.gatherCandidates();
          const natType = this.natTraversal.getNatType();
          const netInterfaces = os.networkInterfaces();
          const memUsage = process.memoryUsage();

          return {
            id: request.id,
            success: true,
            data: {
              natType,
              candidates: candidates.length,
              publicAddresses: candidates.filter(c => c.type === 'srflx').map(c => c.address),
              localAddresses: candidates.filter(c => c.type === 'host').map(c => c.address),
              networkInterfaces: Object.keys(netInterfaces),
              memoryUsage: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                rss: Math.round(memUsage.rss / 1024 / 1024),
              },
              uptime: process.uptime(),
              platform: process.platform,
              nodeVersion: process.version,
            }
          };
        }

        case 'network.test.connectivity': {
          const params = request.params as any;
          const success = await this.natTraversal.testConnectivity(
            params.address,
            params.port,
            params.timeout || 5000
          );
          return { id: request.id, success: true, data: { reachable: success } };
        }

        case 'policy.set': {
          const params = request.params as any;
          this.policyEnforcer.setPolicy(params.server_id, params.policy);
          return { id: request.id, success: true };
        }

        case 'policy.get': {
          const policy = this.policyEnforcer.getPolicy(request.params?.server_id as string);
          return { id: request.id, success: true, data: policy };
        }

        case 'policy.add.device': {
          const params = request.params as any;
          this.policyEnforcer.addAllowedDevice(params.server_id, params.device_id);
          return { id: request.id, success: true };
        }

        case 'policy.remove.device': {
          const params = request.params as any;
          this.policyEnforcer.removeAllowedDevice(params.server_id, params.device_id);
          return { id: request.id, success: true };
        }

        case 'policy.ban.device': {
          const params = request.params as any;
          this.policyEnforcer.banDevice(params.server_id, params.device_id);
          return { id: request.id, success: true };
        }

        case 'policy.check': {
          const params = request.params as any;
          const canConnect = this.policyEnforcer.canConnect(
            params.server_id,
            params.device_id,
            params.invite_code
          );
          return { id: request.id, success: true, data: { allowed: canConnect } };
        }

        case 'session.start': {
          const params = request.params as any;
          const serverId = params.server_id;
          const serverConfig = this.serverManager.getServerConfig(serverId);
          if (!serverConfig) {
            return { id: request.id, success: false, error: 'Server not found' };
          }
          if (serverConfig.status !== 'running') {
            return { id: request.id, success: false, error: 'Server is not running' };
          }
          if (this.connectionProxies.has(serverId)) {
            return { id: request.id, success: false, error: 'Session already active' };
          }

          const useE2EE = !!(this.noiseKeyStore && this.settingsStore?.getUseRustProxy());
          const e2eeKeys = useE2EE && this.noiseKeyStore ? this.noiseKeyStore.getKeys() : undefined;

          const ConnectionProxy = require('./connection-proxy').ConnectionProxy;
          const proxy = new ConnectionProxy({
            serverId,
            minecraftHost: '127.0.0.1',
            minecraftPort: serverConfig.port || 25565,
            localProxyPort: params.local_proxy_port || (serverConfig.port || 25565) + 10000,
            e2eeKeys,
          });

          proxy.start();
          this.connectionProxies.set(serverId, proxy);

          proxy.on('connection', (conn: any) => {
            console.log(`Remote player connected to session for server ${serverId}`);
          });

          return {
            id: request.id,
            success: true,
            data: {
              server_id: serverId,
              local_proxy_port: proxy.config.localProxyPort,
              minecraft_port: serverConfig.port,
              e2ee_enabled: !!e2eeKeys,
              noise_public_key: this.noiseKeyStore?.getPublicKeyHex() || null,
            },
          };
        }

        case 'session.stop': {
          const serverId = request.params?.server_id as string;
          const proxy = this.connectionProxies.get(serverId);
          if (proxy) {
            proxy.stop();
            this.connectionProxies.delete(serverId);
            return { id: request.id, success: true };
          }
          return { id: request.id, success: false, error: 'No active session' };
        }

        case 'session.list': {
          const sessions: any[] = [];
          for (const [serverId, proxy] of this.connectionProxies.entries()) {
            sessions.push({
              server_id: serverId,
              local_proxy_port: proxy.config.localProxyPort,
              active_connections: proxy.getConnectionCount(),
            });
          }
          return { id: request.id, success: true, data: sessions };
        }

        case 'guest.join': {
          const params = request.params as any;
          const inviteCode = params.invite_code;
          const localProxyPort = params.local_proxy_port || 25566;

          if (!inviteCode) {
            return { id: request.id, success: false, error: 'Invite code required' };
          }

          if (!this.supabase) {
            return { id: request.id, success: false, error: 'Supabase not configured' };
          }

          try {
            const invite = await getInviteByCode(this.supabase, inviteCode);
            if (!invite) {
              return { id: request.id, success: false, error: 'Invalid or expired invite code' };
            }

            if (new Date(invite.expires_at) < new Date()) {
              return { id: request.id, success: false, error: 'Invite code expired' };
            }

            if (invite.current_uses >= invite.max_uses) {
              return { id: request.id, success: false, error: 'Invite code max uses reached' };
            }

            await incrementInviteUsage(this.supabase, invite.id);

            const hostDevice = await getHostDeviceInfo(this.supabase, invite.host_device_id);
            const hostIp = hostDevice?.public_ip;
            const hostPort = hostDevice?.public_port || 25565;

            if (!hostIp) {
              return { id: request.id, success: false, error: 'Host is offline' };
            }

            const ConnectionProxy = require('./connection-proxy').ConnectionProxy;
            const guestProxy = new ConnectionProxy({
              serverId: `guest-${inviteCode}`,
              minecraftHost: hostIp,
              minecraftPort: hostPort,
              localProxyPort: localProxyPort,
            });

            guestProxy.start();
            this.connectionProxies.set(`guest-${inviteCode}`, guestProxy);

            return {
              id: request.id,
              success: true,
              data: {
                session_id: invite.id,
                local_proxy_port: localProxyPort,
                host_ip: hostIp,
                host_port: hostPort,
                connection_type: 'direct',
              },
            };
          } catch (err: any) {
            return { id: request.id, success: false, error: err.message || 'Failed to join' };
          }
        }

        case 'guest.leave': {
          const params = request.params as any;
          const inviteCode = params.invite_code;
          const guestKey = `guest-${inviteCode}`;
          const proxy = this.connectionProxies.get(guestKey);
          if (proxy) {
            proxy.stop();
            this.connectionProxies.delete(guestKey);
            return { id: request.id, success: true };
          }
          return { id: request.id, success: false, error: 'No active guest session' };
        }

        case 'supabase.metrics.fetch': {
          const params = request.params as any;
          const projectRef = params.project_ref;
          const serviceRoleKey = params.service_role_key;

          if (!projectRef || !serviceRoleKey) {
            return { id: request.id, success: false, error: 'Project reference and Service Role key are required' };
          }

          try {
            const url = `https://${projectRef.trim()}.supabase.co/customer/v1/privileged/metrics`;
            const auth = Buffer.from(`service_role:${serviceRoleKey.trim()}`).toString('base64');
            
            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'text/plain',
              },
            });

            if (!response.ok) {
              return { 
                id: request.id, 
                success: false, 
                error: `Supabase API returned error: ${response.status} ${response.statusText}` 
              };
            }

            const rawMetrics = await response.text();
            return { id: request.id, success: true, data: { raw: rawMetrics } };
          } catch (err: any) {
            return { id: request.id, success: false, error: err.message || 'Failed to fetch metrics from Supabase' };
          }
        }

        default:
          return {
            id: request.id,
            success: false,
            error: `Unknown command: ${request.command}`,
          };
      }
    } catch (err: any) {
      return {
        id: request.id,
        success: false,
        error: err.message || 'Command execution failed',
      };
    }
  }

  stop(): void {
    for (const interval of this.pingIntervals.values()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();
    for (const timer of this.pingTimers.values()) {
      clearTimeout(timer);
    }
    this.pingTimers.clear();
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close();
    }
  }
}
