import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TelemetryEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  device_id: string;
  app_version: string;
  platform: string;
}

interface TelemetryConfig {
  endpoint?: string;
  apiKey?: string;
  deviceId?: string;
  appVersion?: string;
  enabled?: boolean;
  flushInterval?: number;
  maxQueueSize?: number;
}

export class TelemetryClient {
  private endpoint: string;
  private apiKey: string;
  private deviceId: string;
  private appVersion: string;
  private enabled: boolean;
  private queue: TelemetryEvent[];
  private flushInterval: number;
  private maxQueueSize: number;
  private timer: ReturnType<typeof setInterval> | null;

  constructor(config: TelemetryConfig = {}) {
    this.endpoint = config.endpoint || 'https://telemetry.mchosting.local/collect';
    this.apiKey = config.apiKey || process.env.TELEMETRY_API_KEY || '';
    this.deviceId = config.deviceId || this.getDeviceId();
    this.appVersion = config.appVersion || '0.2.0';
    this.enabled = config.enabled !== false;
    this.queue = [];
    this.flushInterval = config.flushInterval || 30000;
    this.maxQueueSize = config.maxQueueSize || 100;
    this.timer = null;
  }

  private getDeviceId(): string {
    try {
      const devicePath = path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'MCHosting', 'config', 'device.json'
      );
      if (fs.existsSync(devicePath)) {
        return JSON.parse(fs.readFileSync(devicePath, 'utf-8')).id;
      }
    } catch {}
    return 'unknown';
  }

  track(event: string, properties: Record<string, unknown> = {}): void {
    if (!this.enabled) return;

    this.queue.push({
      event,
      properties,
      timestamp: new Date().toISOString(),
      device_id: this.deviceId,
      app_version: this.appVersion,
      platform: process.platform,
    });

    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  trackServerEvent(serverId: string, action: string, details: Record<string, unknown> = {}): void {
    this.track('server_action', {
      server_id: serverId,
      action,
      ...details,
    });
  }

  trackConnection(type: string, latency: number, success: boolean): void {
    this.track('connection_attempt', {
      type,
      latency_ms: latency,
      success,
    });
  }

  trackError(error: Error, context: Record<string, unknown> = {}): void {
    this.track('error', {
      message: error.message || String(error),
      stack: error.stack,
      ...context,
    });
  }

  trackPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.track('performance', {
      metric,
      value,
      unit,
    });
  }

  flush(): void {
    if (this.queue.length === 0 || !this.enabled) return;

    const batch = [...this.queue];
    this.queue = [];

    if (typeof fetch !== 'undefined') {
      fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ events: batch }),
      }).catch(() => {
        this.queue.unshift(...batch);
      });
    }
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}
