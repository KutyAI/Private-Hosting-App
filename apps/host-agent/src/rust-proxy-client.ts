import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

interface StartProxyCmd {
  type: 'start_proxy';
  server_id: string;
  listen_port: number;
  mc_port: number;
}

interface StopProxyCmd {
  type: 'stop_proxy';
  server_id: string;
}

interface PingCmd {
  type: 'ping';
}

type ProxyCommand = StartProxyCmd | StopProxyCmd | PingCmd;

export interface ProxyEvent {
  type: 'proxy_started' | 'proxy_stopped' | 'connection_opened' | 'connection_closed' | 'error' | 'pong';
  server_id?: string;
  listen_port?: number;
  peer?: string;
  bytes_in?: number;
  bytes_out?: number;
  message?: string;
}

export class RustProxyClient extends EventEmitter {
  private proc: ChildProcess | null = null;
  private running = false;

  constructor(private binPath: string) {
    super();
  }

  isAvailable(): boolean {
    return fs.existsSync(this.binPath);
  }

  start(): void {
    if (this.running) return;

    if (!this.isAvailable()) {
      console.warn(`[rust-proxy] binary not found at ${this.binPath}, skipping`);
      return;
    }

    this.proc = spawn(this.binPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, RUST_LOG: 'mc_relay_proxy=info' },
    });

    const rl = createInterface({ input: this.proc.stdout! });
    rl.on('line', (line: string) => {
      try {
        const event: ProxyEvent = JSON.parse(line);
        this.emit('event', event);
      } catch {
        console.warn('[rust-proxy] unparsable stdout:', line);
      }
    });

    this.proc.stderr!.on('data', (chunk: Buffer) => {
      process.stderr.write(`[rust-proxy] ${chunk.toString()}`);
    });

    this.proc.on('exit', (code) => {
      this.running = false;
      console.warn(`[rust-proxy] exited with code ${code}`);
      this.emit('exit', code);
    });

    this.proc.on('error', (err) => {
      console.error('[rust-proxy] spawn error:', err.message);
      this.running = false;
    });

    this.running = true;
    console.log(`[rust-proxy] started (${this.binPath})`);
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.running = false;
  }

  send(cmd: ProxyCommand): void {
    if (!this.proc?.stdin?.writable) {
      console.warn('[rust-proxy] not running or stdin closed');
      return;
    }
    this.proc.stdin.write(JSON.stringify(cmd) + '\n');
  }

  startProxy(serverId: string, listenPort: number, mcPort: number): void {
    this.send({ type: 'start_proxy', server_id: serverId, listen_port: listenPort, mc_port: mcPort });
  }

  stopProxy(serverId: string): void {
    this.send({ type: 'stop_proxy', server_id: serverId });
  }

  ping(): void {
    this.send({ type: 'ping' });
  }

  static resolveBinPath(dataDir: string): string {
    const platform = process.platform;
    const arch = process.arch;

    const targets: Record<string, string> = {
      'darwin/arm64': 'mc-relay-proxy-aarch64-apple-darwin',
      'darwin/x64': 'mc-relay-proxy-x86_64-apple-darwin',
      'win32/x64': 'mc-relay-proxy-x86_64-pc-windows-msvc.exe',
      'linux/x64': 'mc-relay-proxy-x86_64-unknown-linux-gnu',
      'linux/arm64': 'mc-relay-proxy-aarch64-unknown-linux-gnu',
    };

    const key = `${platform}/${arch}`;
    const binaryName = targets[key] || `mc-relay-proxy-${arch}-unknown-${platform}`;
    return path.join(dataDir, 'bin', binaryName);
  }
}
