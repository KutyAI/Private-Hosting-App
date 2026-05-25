import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as tar from 'tar';
import axios from 'axios';
import extractZip from 'extract-zip';
import { JavaInstallationInfo } from '@mc-host/shared-types';

interface AdoptiumAsset {
  binary: {
    package: {
      link: string;
      checksum: string;
      name: string;
    };
  };
}

export function resolveRequiredJavaVersion(minecraftVersion: string): number {
  const normalized = minecraftVersion.trim();
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
  if (!match) {
    return 17;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (major > 1 || (major === 1 && (minor > 20 || (minor === 20 && patch >= 5)))) {
    return 21;
  }

  if (major === 1 && minor >= 17) {
    return 17;
  }

  return 8;
}

export class JavaInstaller {
  constructor(private runtimesDir: string) {
    fs.mkdirSync(runtimesDir, { recursive: true });
  }

  async ensureForMinecraftVersion(minecraftVersion: string): Promise<JavaInstallationInfo> {
    return this.ensureJre(resolveRequiredJavaVersion(minecraftVersion));
  }

  async ensureJre(featureVersion: number): Promise<JavaInstallationInfo> {
    const platform = this.getPlatform();
    const arch = this.getArch();
    const installDir = path.join(this.runtimesDir, `jre-${featureVersion}-${platform}-${arch}`);
    const javaPath = this.resolveJavaBinary(installDir);

    if (javaPath) {
      return {
        feature_version: featureVersion,
        java_path: javaPath,
        install_dir: installDir,
        platform,
        arch,
      };
    }

    const assets = await this.fetchAdoptiumAssets(featureVersion, platform, arch);
    const asset = assets[0]?.binary?.package;

    if (!asset) {
      throw new Error(`No Adoptium JRE found for Java ${featureVersion} on ${platform}/${arch}`);
    }

    const tempFile = path.join(os.tmpdir(), `${randomUUID()}-${asset.name}`);
    try {
      await this.download(asset.link, tempFile);
      await this.verifyChecksum(tempFile, asset.checksum);
      fs.mkdirSync(installDir, { recursive: true });

      if (asset.name.endsWith('.zip')) {
        await extractZip(tempFile, { dir: installDir });
      } else if (asset.name.endsWith('.tar.gz') || asset.name.endsWith('.tgz')) {
        await this.extractTarGz(tempFile, installDir);
      } else {
        throw new Error(`Unsupported archive format for ${asset.name}`);
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }

    const resolvedJava = this.resolveJavaBinary(installDir);
    if (!resolvedJava) {
      throw new Error(`Java binary not found after installing JRE ${featureVersion}`);
    }

    return {
      feature_version: featureVersion,
      java_path: resolvedJava,
      install_dir: installDir,
      platform,
      arch,
    };
  }

  private async fetchAdoptiumAssets(featureVersion: number, platform: string, arch: string): Promise<AdoptiumAsset[]> {
    const url = `https://api.adoptium.net/v3/assets/latest/${featureVersion}/hotspot?architecture=${arch}&image_type=jre&os=${platform}&vendor=eclipse`;
    const response = await axios.get<AdoptiumAsset[]>(url, { timeout: 10_000 });
    return response.data;
  }

  private async download(url: string, destination: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'stream', timeout: 10_000 });
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(destination);
      response.data.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
      response.data.on('error', reject);
    });
  }

  private async verifyChecksum(filePath: string, expectedChecksum: string): Promise<void> {
    const hash = createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: Buffer | string) => { hash.update(chunk); });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    const actual = hash.digest('hex');
    if (actual !== expectedChecksum) {
      throw new Error(`Checksum mismatch for ${filePath}`);
    }
  }

  private async extractTarGz(filePath: string, destination: string): Promise<void> {
    await tar.x({ file: filePath, cwd: destination });
  }

  private resolveJavaBinary(rootDir: string): string | null {
    if (!fs.existsSync(rootDir)) {
      return null;
    }

    const stack = [rootDir];
    const targetName = process.platform === 'win32' ? 'java.exe' : 'java';

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || !fs.existsSync(current)) {
        continue;
      }

      const directCandidates = [
        path.join(current, 'bin', targetName),
        path.join(current, 'Contents', 'Home', 'bin', targetName),
      ];

      for (const candidate of directCandidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      try {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            stack.push(path.join(current, entry.name));
          }
        }
      } catch {
        // Ignore permission/read errors while walking the tree.
      }
    }

    return null;
  }

  private getPlatform(): 'mac' | 'windows' | 'linux' {
    switch (process.platform) {
      case 'darwin':
        return 'mac';
      case 'win32':
        return 'windows';
      default:
        return 'linux';
    }
  }

  private getArch(): 'x64' | 'aarch64' {
    return process.arch === 'arm64' ? 'aarch64' : 'x64';
  }
}
