import { SupabaseClient } from '@supabase/supabase-js';
import { updateDevicePresence } from './supabase-client';

export interface PresenceConfig {
  supabase: SupabaseClient;
  deviceId: string;
  intervalMs?: number;
}

export class PresenceManager {
  private config: PresenceConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private serverStatus = 'offline';
  private playerCount = 0;
  private publicIp = '';
  private publicPort = 25565;
  private natType = 'unknown';

  constructor(config: PresenceConfig) {
    this.config = config;
  }

  setNetworkInfo(ip: string, port: number, natType: string): void {
    this.publicIp = ip;
    this.publicPort = port;
    this.natType = natType;
  }

  start(): void {
    this.sendHeartbeat();
    const interval = this.config.intervalMs || 30000;
    this.timer = setInterval(() => this.sendHeartbeat(), interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateStatus(status: string, players: number): void {
    this.serverStatus = status;
    this.playerCount = players;
  }

  async sendHeartbeat(): Promise<void> {
    try {
      await updateDevicePresence(this.config.supabase, this.config.deviceId, {
        public_ip: this.publicIp || undefined,
        public_port: this.publicPort,
        nat_type: this.natType,
      });
    } catch {
      // Silently fail - will retry on next interval
    }
  }
}
