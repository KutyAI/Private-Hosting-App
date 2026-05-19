import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: string;
  mandatory: boolean;
}

export interface UpdateCheckerConfig {
  currentVersion: string;
  updateUrl: string;
  checkIntervalMs?: number;
  channel?: 'stable' | 'beta' | 'nightly';
}

export class UpdateChecker {
  private config: UpdateCheckerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheck: number = 0;
  private pendingUpdate: UpdateInfo | null = null;

  constructor(config: UpdateCheckerConfig) {
    this.config = config;
  }

  start(): void {
    this.checkForUpdates();
    const interval = this.config.checkIntervalMs || 4 * 60 * 60 * 1000;
    this.timer = setInterval(() => this.checkForUpdates(), interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    this.lastCheck = Date.now();

    try {
      const updateInfo = await this.fetchUpdateInfo();

      if (updateInfo && this.isNewerVersion(updateInfo.version, this.config.currentVersion)) {
        this.pendingUpdate = updateInfo;
        return updateInfo;
      }

      return null;
    } catch (err) {
      console.error('Update check failed:', err);
      return null;
    }
  }

  getPendingUpdate(): UpdateInfo | null {
    return this.pendingUpdate;
  }

  clearPendingUpdate(): void {
    this.pendingUpdate = null;
  }

  private async fetchUpdateInfo(): Promise<UpdateInfo | null> {
    return new Promise((resolve) => {
      const url = new URL(this.config.updateUrl);
      const client = url.protocol === 'https:' ? https : http;

      const req = client.get(url.toString(), {
        headers: {
          'User-Agent': `MC-Hosting-Agent/${this.config.currentVersion}`,
          'Accept': 'application/json',
        },
        timeout: 10000,
      }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const info = JSON.parse(data) as UpdateInfo;
              resolve(info);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private isNewerVersion(newVersion: string, currentVersion: string): boolean {
    const parse = (v: string) => v.split('.').map(Number);
    const newParts = parse(newVersion);
    const currentParts = parse(currentVersion);

    for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
      const newPart = newParts[i] || 0;
      const currentPart = currentParts[i] || 0;
      if (newPart > currentPart) return true;
      if (newPart < currentPart) return false;
    }

    return false;
  }
}
