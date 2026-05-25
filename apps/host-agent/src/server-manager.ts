import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalServer, ModrinthInstallResult, ServerMetrics, LogEntry } from '@mc-host/shared-types';
import { SettingsStore } from './settings-store';
import { JavaInstaller } from './java-installer';
import { ModrinthInstaller } from './modrinth-installer';
import { findFreePort } from './port-allocator';

interface RunningServer {
  config: LocalServer;
  process: ChildProcess;
  startTime: number;
  crashCount: number;
  lastCrashTime: number;
}

export class ServerManager extends EventEmitter {
  private servers: Map<string, RunningServer> = new Map();
  private logBuffer: Map<string, LogEntry[]> = new Map();
  private logListeners: Map<string, ((entry: LogEntry) => void)[]> = new Map();
  private dataDir: string;
  private settingsStore: SettingsStore;
  private javaInstaller: JavaInstaller;
  private modrinthInstaller: ModrinthInstaller;
  private stoppingServers: Set<string> = new Set();

  constructor(
    dataDir: string,
    settingsStore: SettingsStore,
    javaInstaller: JavaInstaller,
    modrinthInstaller: ModrinthInstaller,
  ) {
    super();
    this.dataDir = dataDir;
    this.settingsStore = settingsStore;
    this.javaInstaller = javaInstaller;
    this.modrinthInstaller = modrinthInstaller;
  }

  async createServer(
    config: Omit<LocalServer, 'status' | 'created_at' | 'port'> & { port?: number; auto_port?: boolean },
  ): Promise<LocalServer> {
    const serverDir = this.getServerDir(config.id);
    if (fs.existsSync(serverDir)) {
      throw new Error(`Server directory already exists: ${config.id}`);
    }

    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'world'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'mods'), { recursive: true });

    const usedPorts = new Set(this.listServers().map((server) => server.port));
    const preferredPort = config.port || 25565;
    const resolvedPort = config.auto_port || !config.port || usedPorts.has(preferredPort)
      ? await findFreePort(preferredPort, usedPorts)
      : preferredPort;

    let modrinthResult: ModrinthInstallResult | null = null;
    if (config.modrinth_version_id) {
      modrinthResult = await this.modrinthInstaller.installModrinthPack(
        config.modrinth_version_id,
        serverDir,
        () => undefined,
        config.java_path,
      );
    }

    const serverConfig: LocalServer = {
      ...config,
      server_type: (modrinthResult?.loader || config.server_type) as LocalServer['server_type'],
      port: resolvedPort,
      status: 'stopped',
      created_at: new Date().toISOString(),
      loader: modrinthResult?.loader || config.loader || config.server_type,
      mc_version: modrinthResult?.mc_version || config.mc_version,
      modrinth_project_id: modrinthResult?.project_id || config.modrinth_project_id,
      modrinth_version_id: modrinthResult?.version_id || config.modrinth_version_id,
      server_jar_path: modrinthResult?.server_jar_path || config.server_jar_path,
    };

    this.saveServerConfig(serverConfig);
    this.writeServerProperties(serverConfig);
    this.writeEula(serverDir);

    return serverConfig;
  }

  async startServer(serverId: string): Promise<void> {
    const running = this.servers.get(serverId);
    if (running) {
      throw new Error('Server is already running');
    }

    if (this.servers.size >= this.settingsStore.getMaxConcurrentInstances()) {
      throw new Error(`Maximum concurrent instances reached (${this.settingsStore.getMaxConcurrentInstances()})`);
    }

    const config = this.loadServerConfig(serverId);
    if (!config) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const serverDir = this.getServerDir(serverId);
    let javaPath = config.java_path || await this.findJava();

    if (!javaPath) {
      const installation = await this.javaInstaller.ensureForMinecraftVersion(config.mc_version);
      javaPath = installation.java_path;
      config.java_path = installation.java_path;
      this.saveServerConfig(config);
    }

    if (!javaPath) {
      throw new Error('Java not found. Please install Java 17 or higher.');
    }

    let serverJar = config.server_jar_path && fs.existsSync(config.server_jar_path)
      ? config.server_jar_path
      : this.getServerJar(serverDir, config.loader || config.server_type, config.mc_version);

    if (!fs.existsSync(serverJar)) {
      this.addLog(serverId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Downloading ${config.server_type} ${config.mc_version}...`,
        source: 'agent',
      });
      try {
        if (config.modrinth_version_id) {
          const installResult = await this.modrinthInstaller.installModrinthPack(
            config.modrinth_version_id,
            serverDir,
            () => undefined,
            config.java_path,
          );
          serverJar = installResult.server_jar_path || serverJar;
          config.server_type = installResult.loader as LocalServer['server_type'];
          config.server_jar_path = installResult.server_jar_path || config.server_jar_path;
          config.loader = installResult.loader;
          config.mc_version = installResult.mc_version;
          this.saveServerConfig(config);
        } else {
          await this.downloadServerJar(serverDir, config.server_type, config.mc_version);
        }
      } catch (err: any) {
        throw new Error(`Failed to download server JAR: ${err.message}`);
      }
    }

    const isScriptLauncher = serverJar.endsWith('.sh') || serverJar.endsWith('.bat');

    if (!fs.existsSync(serverJar)) {
      throw new Error(`Server JAR not found at ${serverJar}. Download failed.`);
    }

    if (!isScriptLauncher) {
      const jarStats = fs.statSync(serverJar);
      if (jarStats.size < 1000) {
        throw new Error(`Server JAR is corrupted (${jarStats.size} bytes). Delete it and try again.`);
      }
    }

    this.addLog(serverId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting server with Java: ${javaPath}`,
      source: 'agent',
    });

    this.stoppingServers.delete(serverId);
    if (isScriptLauncher) {
      const jvmArgs = [`-Xms${config.memory_min_mb}M`, `-Xmx${config.memory_max_mb}M`].join('\n') + '\n';
      fs.writeFileSync(path.join(serverDir, 'user_jvm_args.txt'), jvmArgs);
    }

    const command = isScriptLauncher
      ? (process.platform === 'win32' ? 'cmd' : 'bash')
      : javaPath;
    const args = isScriptLauncher
      ? (process.platform === 'win32' ? ['/c', serverJar] : [serverJar])
      : [
          '-Xms' + config.memory_min_mb + 'M',
          '-Xmx' + config.memory_max_mb + 'M',
          '-jar',
          serverJar,
          'nogui',
        ];

    const child = spawn(command, args, {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      detached: false,
      shell: false,
      windowsHide: true,
    });

    const runningServer: RunningServer = {
      config,
      process: child,
      startTime: Date.now(),
      crashCount: 0,
      lastCrashTime: 0,
    };

    this.servers.set(serverId, runningServer);
    this.logBuffer.set(serverId, []);

    config.status = 'starting';
    this.saveServerConfig(config);

    this.emit('server.started', {
      server_id: serverId,
      server_name: config.name,
      port: config.port,
    });

    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: this.parseLogLevel(line),
            message: line.trim(),
            source: 'server',
          };
          this.addLog(serverId, entry);

          const playerJoined = line.match(/(?:\]:\s|\s)(.+?) joined the game/i);
          if (playerJoined) {
            this.emit('player.joined', {
              server_id: serverId,
              server_name: config.name,
              player: playerJoined[1].trim(),
            });
          }

          const playerLeft = line.match(/(?:\]:\s|\s)(.+?) left the game/i);
          if (playerLeft) {
            this.emit('player.left', {
              server_id: serverId,
              server_name: config.name,
              player: playerLeft[1].trim(),
            });
          }
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: line.trim(),
            source: 'server',
          };
          this.addLog(serverId, entry);
        }
      }
    });

    child.on('exit', (code, signal) => {
      this.handleServerExit(serverId, code, signal);
    });

    child.on('error', (err) => {
      this.addLog(serverId, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Process error: ${err.message}`,
        source: 'server',
      });
    });

    config.status = 'running';
    config.pid = child.pid;
    this.saveServerConfig(config);

    this.addLog(serverId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Server started with PID ${child.pid}`,
      source: 'agent',
    });
  }

  async stopServer(serverId: string): Promise<void> {
    const running = this.servers.get(serverId);
    if (!running) {
      throw new Error('Server is not running');
    }

    this.stoppingServers.add(serverId);

    const config = this.loadServerConfig(serverId);
    if (config) {
      config.status = 'stopping';
      this.saveServerConfig(config);
    }

    running.process.stdin?.write('stop\n');
    
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        running.process.kill('SIGTERM');
        resolve();
      }, 10000);

      running.process.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async restartServer(serverId: string): Promise<void> {
    await this.stopServer(serverId).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startServer(serverId);
  }

  async deleteServer(serverId: string): Promise<void> {
    const running = this.servers.get(serverId);
    if (running) {
      await this.stopServer(serverId).catch(() => {});
    }

    const serverDir = this.getServerDir(serverId);
    if (fs.existsSync(serverDir)) {
      fs.rmSync(serverDir, { recursive: true, force: true });
    }

    const configPath = path.join(this.dataDir, 'servers', `${serverId}.json`);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  }

  sendCommand(serverId: string, command: string): boolean {
    const running = this.servers.get(serverId);
    if (!running) {
      return false;
    }

    running.process.stdin?.write(command + '\n');
    return true;
  }

  getLogs(serverId: string, limit: number = 200): LogEntry[] {
    const logs = this.logBuffer.get(serverId) || [];
    return logs.slice(-limit);
  }

  onLog(serverId: string, listener: (entry: LogEntry) => void): () => void {
    if (!this.logListeners.has(serverId)) {
      this.logListeners.set(serverId, []);
    }
    this.logListeners.get(serverId)!.push(listener);
    return () => {
      const listeners = this.logListeners.get(serverId) || [];
      this.logListeners.set(serverId, listeners.filter(l => l !== listener));
    };
  }

  getMetrics(serverId: string): ServerMetrics | null {
    const running = this.servers.get(serverId);
    if (!running) return null;

    const config = running.config;
    const uptime = (Date.now() - running.startTime) / 1000;
    
    let memoryUsed = 0;
    try {
      if (running.process.pid) {
        const usage = process.memoryUsage();
        memoryUsed = Math.round(usage.heapUsed / 1024 / 1024);
      }
    } catch {}

    const logs = this.logBuffer.get(serverId) || [];
    const lastPlayersLine = [...logs].reverse().find(l => 
      l.message.includes('There are') && l.message.includes('players')
    );
    
    let playerCount = 0;
    let maxPlayers = config.port ? 20 : 20;
    if (lastPlayersLine) {
      const match = lastPlayersLine.message.match(/There are (\d+) of a max of (\d+) players/);
      if (match) {
        playerCount = parseInt(match[1]);
        maxPlayers = parseInt(match[2]);
      }
    }

    return {
      cpu_percent: 0,
      memory_used_mb: memoryUsed,
      memory_max_mb: config.memory_max_mb,
      uptime_seconds: uptime,
      player_count: playerCount,
      max_players: maxPlayers,
      tps: 20.0,
    };
  }

  getServerConfig(serverId: string): LocalServer | null {
    return this.loadServerConfig(serverId);
  }

  listServers(): LocalServer[] {
    const serversDir = path.join(this.dataDir, 'servers');
    if (!fs.existsSync(serversDir)) return [];

    const configs: LocalServer[] = [];
    for (const file of fs.readdirSync(serversDir)) {
      if (file.endsWith('.json')) {
        try {
          const config = JSON.parse(
            fs.readFileSync(path.join(serversDir, file), 'utf-8')
          ) as LocalServer;
          const running = this.servers.get(config.id);
          if (running) {
            config.status = 'running';
            config.pid = running.process.pid;
          }
          configs.push(config);
        } catch {}
      }
    }
    return configs;
  }

  async updateProperties(serverId: string, props: Record<string, string>): Promise<void> {
    const config = this.loadServerConfig(serverId);
    if (!config) throw new Error('Server not found');

    const propertiesPath = path.join(this.getServerDir(serverId), 'server.properties');
    let content = '';
    
    if (fs.existsSync(propertiesPath)) {
      content = fs.readFileSync(propertiesPath, 'utf-8');
    }

    const lines = content.split('\n');
    const updatedLines = lines.map(line => {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return line;
      const key = line.substring(0, eqIndex).trim();
      if (props[key] !== undefined) {
        return `${key}=${props[key]}`;
      }
      return line;
    });

    for (const [key, value] of Object.entries(props)) {
      if (!lines.some(l => l.startsWith(key + '='))) {
        updatedLines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(propertiesPath, updatedLines.join('\n'));
    
    Object.assign(config, { ...config });
    this.saveServerConfig(config);
  }

  private addLog(serverId: string, entry: LogEntry): void {
    if (!this.logBuffer.has(serverId)) {
      this.logBuffer.set(serverId, []);
    }
    const buffer = this.logBuffer.get(serverId)!;
    buffer.push(entry);
    
    if (buffer.length > 1000) {
      this.logBuffer.set(serverId, buffer.slice(-500));
    }

    const listeners = this.logListeners.get(serverId) || [];
    for (const listener of listeners) {
      try {
        listener(entry);
      } catch {}
    }
  }

  private handleServerExit(serverId: string, code: number | null, signal: string | null): void {
    const running = this.servers.get(serverId);
    if (!running) return;

    const config = this.loadServerConfig(serverId);
    const manualStop = this.stoppingServers.has(serverId);
    this.stoppingServers.delete(serverId);
    
    const now = Date.now();
    const uptime = now - running.startTime;
    
    if (now - running.lastCrashTime < 60000) {
      running.crashCount++;
    } else {
      running.crashCount = 1;
    }
    running.lastCrashTime = now;

    if (config) {
      if (code === 0 || signal === 'SIGTERM' || manualStop) {
        config.status = 'stopped';
        this.addLog(serverId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Server stopped gracefully',
          source: 'agent',
        });
        this.emit('server.stopped', {
          server_id: serverId,
          server_name: config.name,
          exit_code: code,
          signal,
        });
      } else {
        const crashReason = this.classifyCrash(code, signal, serverId);
        config.status = 'crashed';
        this.addLog(serverId, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Server crashed: ${crashReason} (code: ${code}, signal: ${signal})`,
          source: 'agent',
        });
        this.emit('server.crashed', {
          server_id: serverId,
          server_name: config.name,
          exit_code: code,
          signal,
          reason: crashReason,
        });

        const isStartupFailure = uptime < 10000;
        
        if (isStartupFailure) {
          this.addLog(serverId, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: 'Startup failure detected. Auto-restart disabled. Fix the issue and try again.',
            source: 'agent',
          });
          config.status = 'stopped';
        } else if (config.auto_restart && running.crashCount < 5) {
          const delay = Math.min(5000 * Math.pow(2, running.crashCount - 1), 60000);
          this.addLog(serverId, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Auto-restarting in ${delay / 1000}s... (crash #${running.crashCount})`,
            source: 'agent',
          });
          
          setTimeout(() => {
            this.startServer(serverId).catch(err => {
              this.addLog(serverId, {
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `Auto-restart failed: ${err.message}`,
                source: 'agent',
              });
            });
          }, delay);
        } else if (running.crashCount >= 5) {
          this.addLog(serverId, {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: 'Server crashed 5 times in a minute. Auto-restart disabled to prevent loop.',
            source: 'agent',
          });
          config.status = 'stopped';
        }
      }
      this.saveServerConfig(config);
    }

    this.servers.delete(serverId);
  }

  private classifyCrash(code: number | null, signal: string | null, serverId: string): string {
    if (signal === 'SIGKILL') return 'Process was killed (OOM?)';
    if (signal === 'SIGSEGV') return 'Segmentation fault (Java crash)';
    if (code === 1) return 'Startup error (check Java version or server JAR)';
    if (code === 3221225794) return 'DLL initialization failed (Java not installed or corrupted JAR)';
    if (code === null) return 'Process terminated unexpectedly';
    return `Exit code ${code}`;
  }

  private getServerDir(serverId: string): string {
    return path.join(this.dataDir, 'servers', serverId);
  }

  private saveServerConfig(config: LocalServer): void {
    const serversDir = path.join(this.dataDir, 'servers');
    fs.mkdirSync(serversDir, { recursive: true });
    fs.writeFileSync(
      path.join(serversDir, `${config.id}.json`),
      JSON.stringify(config, null, 2)
    );
  }

  private loadServerConfig(serverId: string): LocalServer | null {
    const configPath = path.join(this.dataDir, 'servers', `${serverId}.json`);
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as LocalServer;
  }

  private writeServerProperties(config: LocalServer): void {
    const propertiesPath = path.join(this.getServerDir(config.id), 'server.properties');
    const maxPlayers = config.max_players || 20;
    const motd = config.motd || config.name || 'A Minecraft Server';
    const gamemode = config.gamemode || 'survival';
    const difficulty = config.difficulty || 'normal';
    const gamemodeMap: Record<LocalServer['gamemode'], number> = {
      survival: 0,
      creative: 1,
      adventure: 2,
      spectator: 3,
    };
    const difficultyMap: Record<LocalServer['difficulty'], number> = {
      peaceful: 0,
      easy: 1,
      normal: 2,
      hard: 3,
    };
    const content = `#Minecraft server properties
server-port=${config.port}
max-players=${maxPlayers}
motd=${motd}
gamemode=${gamemodeMap[gamemode]}
difficulty=${difficultyMap[difficulty]}
level-name=world
online-mode=true
white-list=false
enable-rcon=false
view-distance=10
simulation-distance=10
allow-flight=false
spawn-monsters=true
spawn-animals=true
pvp=true
hardcore=false
enable-command-block=false
`;
    fs.writeFileSync(propertiesPath, content);
  }

  private writeEula(serverDir: string): void {
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
  }

  private async findJava(): Promise<string | null> {
    const candidates = ['java', 'javaw'];
    
    for (const cmd of candidates) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(`"${cmd}" -version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (result) return cmd;
      } catch {
        try {
          const { execSync } = await import('child_process');
          execSync(`"${cmd}" -version`, { stdio: ['pipe', 'pipe', 'pipe'] });
          return cmd;
        } catch {}
      }
    }

    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const javaExe = path.join(javaHome, 'bin', 'java.exe');
      if (fs.existsSync(javaExe)) return javaExe;
    }

    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const javaDirs = [
      path.join(programFiles, 'Java'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Java'),
    ];

    for (const dir of javaDirs) {
      if (fs.existsSync(dir)) {
        for (const subdir of fs.readdirSync(dir)) {
          const javaExe = path.join(dir, subdir, 'bin', 'java.exe');
          if (fs.existsSync(javaExe)) return javaExe;
        }
      }
    }

    return null;
  }

  private getServerJar(serverDir: string, type: string, version: string): string {
    if (type === 'paper') {
      const defaultPath = path.join(serverDir, `paper-${version}.jar`);
      if (fs.existsSync(defaultPath)) {
        return defaultPath;
      }
      try {
        if (fs.existsSync(serverDir)) {
          const files = fs.readdirSync(serverDir);
          const match = files.find(f => f.startsWith(`paper-${version}-`) && f.endsWith('.jar'));
          if (match) {
            return path.join(serverDir, match);
          }
        }
      } catch (e) {
        // ignore read errors
      }
      return defaultPath;
    }
    if (type === 'fabric') {
      const fabricJar = path.join(serverDir, 'fabric-server-launch.jar');
      if (fs.existsSync(fabricJar)) {
        return fabricJar;
      }
    }
    if (type === 'forge' || type === 'neoforge') {
      const forgeJar = path.join(serverDir, `${type}.jar`);
      if (fs.existsSync(forgeJar)) {
        return forgeJar;
      }
    }
    return path.join(serverDir, `server.jar`);
  }

  private async downloadServerJar(serverDir: string, type: string, version: string): Promise<void> {
    const axios = (await import('axios')).default;
    
    if (type === 'vanilla') {
      const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
      const manifest = (await axios.get(manifestUrl)).data;
      
      let versionInfo;
      if (manifest.latest?.release === version || manifest.latest?.snapshot === version) {
        versionInfo = manifest.latest;
      }
      
      if (!versionInfo) {
        for (const v of manifest.versions) {
          if (v.id === version) {
            versionInfo = v;
            break;
          }
        }
      }

      if (!versionInfo) {
        throw new Error(`Vanilla version ${version} not found`);
      }

      const versionDetail = (await axios.get(versionInfo.url)).data;
      const serverJarPath = path.join(serverDir, 'server.jar');
      const response = await axios.get(versionDetail.downloads.server.url, {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(serverJarPath, Buffer.from(response.data));
    } else if (type === 'paper') {
      const buildsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
      const builds = (await axios.get(buildsUrl)).data;
      const latestBuild = builds.builds[builds.builds.length - 1];
      const jarName = `paper-${version}-${latestBuild.build}.jar`;
      
      const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild.build}/downloads/${jarName}`;
      const serverJarPath = path.join(serverDir, `paper-${version}.jar`);
      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(serverJarPath, Buffer.from(response.data));
    }
  }

  private parseLogLevel(line: string): 'info' | 'warn' | 'error' | 'debug' {
    if (line.includes('[ERROR]') || line.includes('ERROR')) return 'error';
    if (line.includes('[WARN]') || line.includes('WARN')) return 'warn';
    if (line.includes('[DEBUG]') || line.includes('DEBUG')) return 'debug';
    return 'info';
  }
}
