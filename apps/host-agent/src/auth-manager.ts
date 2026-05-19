import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { AuthTokens } from '@mc-host/shared-types';

export class AuthManager {
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  saveTokens(tokens: AuthTokens): void {
    const authPath = path.join(this.configDir, 'auth.json');
    fs.writeFileSync(authPath, JSON.stringify({
      ...tokens,
      saved_at: new Date().toISOString(),
    }, null, 2));
  }

  getTokens(): AuthTokens | null {
    const authPath = path.join(this.configDir, 'auth.json');
    if (!fs.existsSync(authPath)) return null;
    
    try {
      const data = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      };
    } catch {
      return null;
    }
  }

  clearTokens(): void {
    const authPath = path.join(this.configDir, 'auth.json');
    if (fs.existsSync(authPath)) {
      fs.unlinkSync(authPath);
    }
  }

  getDeviceId(): string {
    const devicePath = path.join(this.configDir, 'device.json');
    if (!fs.existsSync(devicePath)) {
      const deviceId = uuidv4();
      fs.writeFileSync(devicePath, JSON.stringify({
        id: deviceId,
        name: os.hostname(),
        created_at: new Date().toISOString(),
      }, null, 2));
      return deviceId;
    }

    try {
      const data = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
      return data.id;
    } catch {
      const deviceId = uuidv4();
      fs.writeFileSync(devicePath, JSON.stringify({
        id: deviceId,
        name: os.hostname(),
        created_at: new Date().toISOString(),
      }, null, 2));
      return deviceId;
    }
  }

  getDeviceName(): string {
    const devicePath = path.join(this.configDir, 'device.json');
    if (!fs.existsSync(devicePath)) return os.hostname();
    
    try {
      const data = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
      return data.name || os.hostname();
    } catch {
      return os.hostname();
    }
  }

  updateDeviceName(name: string): void {
    const devicePath = path.join(this.configDir, 'device.json');
    let data: any = { id: uuidv4(), name, created_at: new Date().toISOString() };
    
    if (fs.existsSync(devicePath)) {
      try {
        data = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
      } catch {}
    }
    
    data.name = name;
    fs.writeFileSync(devicePath, JSON.stringify(data, null, 2));
  }

  isLoggedIn(): boolean {
    return this.getTokens() !== null;
  }
}
