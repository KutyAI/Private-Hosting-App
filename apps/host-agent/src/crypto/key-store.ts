import * as fs from 'fs';
import * as path from 'path';
import { generateNoiseKeys, NoiseKeys } from './noise-session';

const KEY_FILE = 'noise-static.json';

export class NoiseKeyStore {
  private keysPath: string;
  private cached: NoiseKeys | null = null;

  constructor(configDir: string) {
    this.keysPath = path.join(configDir, KEY_FILE);
  }

  getKeys(): NoiseKeys {
    if (this.cached) return this.cached;

    if (fs.existsSync(this.keysPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.keysPath, 'utf-8'));
        this.cached = {
          staticPub: Buffer.from(raw.staticPub, 'base64'),
          staticPriv: Buffer.from(raw.staticPriv, 'base64'),
        };
        return this.cached;
      } catch {
        console.warn('[noise] Failed to load static keys, regenerating');
      }
    }

    const keys = generateNoiseKeys();
    fs.writeFileSync(
      this.keysPath,
      JSON.stringify(
        {
          staticPub: keys.staticPub.toString('base64'),
          staticPriv: keys.staticPriv.toString('base64'),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );

    this.cached = keys;
    return keys;
  }

  getPublicKeyHex(): string {
    return this.getKeys().staticPub.toString('hex');
  }
}
