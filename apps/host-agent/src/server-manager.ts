import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalServer, ServerMetrics, LogEntry } from '@mc-host/shared-types';

interface RunningServer {
  config: LocalServer;
  process: ChildProcess;
  startTime: number;
  crashCount: number;
  lastCrashTime: number;
}

export class ServerManager {
  private servers: Map<string, RunningServer> = new Map();
  private logBuffer: Map<string, LogEntry[]> = new Map();
  private logListeners: Map<string, ((entry: LogEntry) => void)[]> = new Map();
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async createServer(config: Omit<LocalServer, 'status' | 'created_at'>): Promise<LocalServer> {
    const serverDir = this.getServerDir(config.id);
    if (fs.existsSync(serverDir)) {
      throw new Error(`Server directory already exists: ${config.id}`);
    }

    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'world'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(serverDir, 'mods'), { recursive: true });

    const serverConfig: LocalServer = {
      ...config,
      status: 'stopped',
      created_at: new Date().toISOString(),
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

    const config = this.loadServerConfig(serverId);
    if (!config) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const serverDir = this.getServerDir(serverId);
    const javaPath = await this.findJava();
    
    if (!javaPath) {
      throw new Error('Java not found. Please install Java 17 or higher.');
    }

    const serverJar = this.getServerJar(serverDir, config.server_type, config.mc_version);
    
    if (!fs.existsSync(serverJar)) {
      this.addLog(serverId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Downloading ${config.server_type} ${config.mc_version}...`,
        source: 'agent',
      });
      try {
        await this.downloadServerJar(serverDir, config.server_type, config.mc_version);
      } catch (err: any) {
        throw new Error(`Failed to download server JAR: ${err.message}`);
      }
    }

    if (!fs.existsSync(serverJar)) {
      throw new Error(`Server JAR not found at ${serverJar}. Download failed.`);
    }

    const jarStats = fs.statSync(serverJar);
    if (jarStats.size < 1000) {
      throw new Error(`Server JAR is corrupted (${jarStats.size} bytes). Delete it and try again.`);
    }

    this.addLog(serverId, {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting server with Java: ${javaPath}`,
      source: 'agent',
    });

    const args = [
      '-Xms' + config.memory_min_mb + 'M',
      '-Xmx' + config.memory_max_mb + 'M',
      '-jar',
      serverJar,
      'nogui'
    ];

    const child = spawn(javaPath, args, {
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
    
    const now = Date.now();
    const uptime = now - running.startTime;
    
    if (now - running.lastCrashTime < 60000) {
      running.crashCount++;
    } else {
      running.crashCount = 1;
    }
    running.lastCrashTime = now;

    if (config) {
      if (code === 0 || signal === 'SIGTERM') {
        config.status = 'stopped';
        this.addLog(serverId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Server stopped gracefully',
          source: 'agent',
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
    const content = `#Minecraft server properties
server-port=${config.port}
max-players=${config.port ? 20 : 20}
motd=${config.name || 'A Minecraft Server'}
gamemode=0
difficulty=1
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
