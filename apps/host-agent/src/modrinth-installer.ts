import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import extractZip from 'extract-zip';
import { JavaInstaller, resolveRequiredJavaVersion } from './java-installer';
import {
  ModrinthInstallResult,
  ModrinthSearchResult,
  ModrinthVersionInfo,
} from '@mc-host/shared-types';

interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  follows: number;
  versions: string[];
  categories: string[];
}

interface ModrinthProjectVersionSummary {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{
    url: string;
    filename: string;
    size: number;
    primary?: boolean;
  }>;
  project_id: string;
  project_title: string;
  project_slug: string;
  project_icon_url?: string;
}

interface ModrinthVersionResponse {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: Array<{
    url: string;
    filename: string;
    size: number;
    primary?: boolean;
    hashes: {
      sha1?: string;
      sha512?: string;
    };
  }>;
  project_id: string;
  project_title: string;
  project_slug: string;
  project_icon_url?: string;
  dependencies: Record<string, string>;
}

interface ModrinthIndexFile {
  path: string;
  downloads: string[];
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  fileSize: number;
}

interface ModrinthIndex {
  formatVersion: number;
  game: 'minecraft';
  dependencies: Record<string, string>;
  files: ModrinthIndexFile[];
}

type ProgressCallback = (percent: number, message: string) => void;

export class ModrinthInstaller {
  constructor(private javaInstaller: JavaInstaller) {}

  async searchModpacks(query: string, limit: number = 20): Promise<ModrinthSearchResult[]> {
    const response = await axios.get<{ hits: ModrinthSearchHit[] }>('https://api.modrinth.com/v2/search', {
      params: {
        query,
        facets: JSON.stringify([['project_type:modpack']]),
        limit,
      },
      timeout: 10_000,
    });

    return response.data.hits.map((hit) => ({
      project_id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      icon_url: hit.icon_url,
      downloads: hit.downloads,
      follows: hit.follows,
      versions: hit.versions,
      categories: hit.categories,
    }));
  }

  async getVersion(versionId: string): Promise<ModrinthVersionInfo> {
    const response = await axios.get<ModrinthVersionResponse>(`https://api.modrinth.com/v2/version/${versionId}`, {
      timeout: 10_000,
    });

    const version = response.data;
    const primaryFile = version.files.find((file) => file.primary) || version.files[0];

    if (!primaryFile) {
      throw new Error(`Modrinth version ${versionId} does not contain downloadable files`);
    }

    return {
      id: version.id,
      name: version.name,
      version_number: version.version_number,
      game_versions: version.game_versions,
      loaders: version.loaders,
      primary_file_url: primaryFile.url,
      primary_file_name: primaryFile.filename,
      primary_file_size: primaryFile.size,
      project_id: version.project_id,
      project_title: version.project_title,
      project_slug: version.project_slug,
      project_icon_url: version.project_icon_url,
    };
  }

  async getProjectVersions(projectId: string): Promise<ModrinthVersionInfo[]> {
    const response = await axios.get<ModrinthProjectVersionSummary[]>(`https://api.modrinth.com/v2/project/${projectId}/version`, {
      timeout: 10_000,
    });

    return response.data.map((version) => {
      const primaryFile = version.files.find((file) => file.primary) || version.files[0];
      if (!primaryFile) {
        throw new Error(`Modrinth project ${projectId} has a version without downloadable files`);
      }

      return {
        id: version.id,
        name: version.name,
        version_number: version.version_number,
        game_versions: version.game_versions,
        loaders: version.loaders,
        primary_file_url: primaryFile.url,
        primary_file_name: primaryFile.filename,
        primary_file_size: primaryFile.size,
        project_id: version.project_id,
        project_title: version.project_title,
        project_slug: version.project_slug,
        project_icon_url: version.project_icon_url,
      };
    });
  }

  async installModrinthPack(
    versionId: string,
    targetDir: string,
    onProgress: ProgressCallback = () => undefined,
    javaPath?: string,
  ): Promise<ModrinthInstallResult> {
    const version = await this.getVersion(versionId);
    const packTempDir = path.join(os.tmpdir(), `modrinth-${randomUUID()}`);
    const packArchive = path.join(packTempDir, version.primary_file_name);
    const extractDir = path.join(packTempDir, 'extract');

    fs.mkdirSync(packTempDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    try {
      onProgress(5, 'Downloading Modrinth pack');
      await this.download(version.primary_file_url, packArchive);

      onProgress(20, 'Extracting pack archive');
      fs.mkdirSync(extractDir, { recursive: true });
      await extractZip(packArchive, { dir: extractDir });

      const indexPath = path.join(extractDir, 'modrinth.index.json');
      if (!fs.existsSync(indexPath)) {
        throw new Error('Invalid Modrinth pack: modrinth.index.json is missing');
      }

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as ModrinthIndex;
      const loader = this.detectLoader(index.dependencies);
      const mcVersion = index.dependencies.minecraft || version.game_versions[0] || version.version_number;

      onProgress(35, 'Applying overrides');
      const overridesDir = path.join(extractDir, 'overrides');
      if (fs.existsSync(overridesDir)) {
        this.copyDirectory(overridesDir, targetDir);
      }

      onProgress(50, 'Installing pack files');
      let completedFiles = 0;
      for (const file of index.files) {
        const destination = path.join(targetDir, file.path);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        await this.download(file.downloads[0], destination);
        await this.verifyHash(destination, file.hashes);
        completedFiles++;
        const progress = 50 + Math.floor((completedFiles / Math.max(index.files.length, 1)) * 30);
        onProgress(progress, `Installed ${file.path}`);
      }

      onProgress(82, 'Preparing loader runtime');
      const serverJarPath = await this.installLoaderRuntime(loader, mcVersion, index.dependencies, targetDir, javaPath, onProgress);

      onProgress(100, 'Modrinth installation complete');
      return {
        project_id: version.project_id,
        version_id: version.id,
        title: version.project_title,
        mc_version: mcVersion,
        loader,
        loader_version: this.detectLoaderVersion(index.dependencies, loader),
        server_jar_path: serverJarPath,
        target_dir: targetDir,
      };
    } finally {
      if (fs.existsSync(packTempDir)) {
        fs.rmSync(packTempDir, { recursive: true, force: true });
      }
    }
  }

  private detectLoader(dependencies: Record<string, string>): ModrinthInstallResult['loader'] {
    if (dependencies['fabric-loader']) {
      return 'fabric';
    }
    if (dependencies['forge']) {
      return 'forge';
    }
    if (dependencies['neoforge']) {
      return 'neoforge';
    }
    if (dependencies['quilt-loader']) {
      return 'quilt';
    }
    return 'vanilla';
  }

  private detectLoaderVersion(
    dependencies: Record<string, string>,
    loader: ModrinthInstallResult['loader'],
  ): string | undefined {
    switch (loader) {
      case 'fabric':
        return dependencies['fabric-loader'];
      case 'forge':
        return dependencies['forge'];
      case 'neoforge':
        return dependencies['neoforge'];
      case 'quilt':
        return dependencies['quilt-loader'];
      default:
        return undefined;
    }
  }

  private async installLoaderRuntime(
    loader: ModrinthInstallResult['loader'],
    mcVersion: string,
    dependencies: Record<string, string>,
    targetDir: string,
    javaPath: string | undefined,
    onProgress: ProgressCallback,
  ): Promise<string | undefined> {
    switch (loader) {
      case 'vanilla':
        return path.join(targetDir, 'server.jar');
      case 'fabric':
        return this.installFabricServer(mcVersion, dependencies['fabric-loader'], targetDir, javaPath, onProgress);
      case 'forge':
        return this.installForgeServer(mcVersion, dependencies['forge'], targetDir, javaPath, onProgress, 'forge');
      case 'neoforge':
        return this.installForgeServer(mcVersion, dependencies['neoforge'], targetDir, javaPath, onProgress, 'neoforge');
      case 'quilt':
        throw new Error('Quilt modpack installation is not implemented yet.');
      default:
        throw new Error(`Unsupported loader: ${loader}`);
    }
  }

  private async installFabricServer(
    mcVersion: string,
    loaderVersion: string | undefined,
    targetDir: string,
    javaPath: string | undefined,
    onProgress: ProgressCallback,
  ): Promise<string> {
    if (!loaderVersion) {
      throw new Error('Fabric loader version is missing from the Modrinth pack metadata');
    }

    const resolvedJava = javaPath || (await this.javaInstaller.ensureForMinecraftVersion(mcVersion)).java_path;
    const installerVersion = await this.fetchFabricInstallerVersion();
    const installerJar = await this.downloadTempAsset(
      `https://maven.fabricmc.net/net/fabricmc/fabric-installer/${installerVersion}/fabric-installer-${installerVersion}.jar`,
      'fabric-installer.jar',
    );

    onProgress(85, 'Installing Fabric server runtime');
    await this.runJavaInstaller(resolvedJava, installerJar, [
      'server',
      '-downloadMinecraft',
      '-dir',
      targetDir,
      '-mcversion',
      mcVersion,
      '-loader',
      loaderVersion,
      '-noprofile',
    ]);

    return path.join(targetDir, 'fabric-server-launch.jar');
  }

  private async installForgeServer(
    mcVersion: string,
    loaderVersion: string | undefined,
    targetDir: string,
    javaPath: string | undefined,
    onProgress: ProgressCallback,
    loader: 'forge' | 'neoforge',
  ): Promise<string> {
    if (!loaderVersion) {
      throw new Error(`Modrinth pack is missing the ${loader} loader version`);
    }

    const resolvedJava = javaPath || (await this.javaInstaller.ensureForMinecraftVersion(mcVersion)).java_path;
    const installerJar = await this.downloadTempAsset(
      this.getForgeInstallerUrl(loader, mcVersion, loaderVersion),
      `${loader}-installer.jar`,
    );

    onProgress(85, `Installing ${loader} server runtime`);
    await this.runJavaInstaller(resolvedJava, installerJar, ['--installServer', targetDir]);

    const runScript = process.platform === 'win32' ? path.join(targetDir, 'run.bat') : path.join(targetDir, 'run.sh');
    return fs.existsSync(runScript) ? runScript : path.join(targetDir, `${loader}.jar`);
  }

  private async fetchFabricInstallerVersion(): Promise<string> {
    const response = await axios.get<Array<{ version: string }>>('https://meta.fabricmc.net/v2/versions/installer', {
      timeout: 10_000,
    });
    const latest = response.data[0]?.version;
    if (!latest) {
      throw new Error('Unable to resolve the latest Fabric installer version');
    }
    return latest;
  }

  private getForgeInstallerUrl(loader: 'forge' | 'neoforge', mcVersion: string, loaderVersion: string): string {
    if (loader === 'forge') {
      return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;
    }

    return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${mcVersion}-${loaderVersion}/neoforge-${mcVersion}-${loaderVersion}-installer.jar`;
  }

  private async runJavaInstaller(javaPath: string, installerJar: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = require('child_process').spawn(javaPath, ['-jar', installerJar, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `Java installer exited with code ${code}`));
      });
    });
  }

  private async downloadTempAsset(url: string, filename: string): Promise<string> {
    const directory = path.join(os.tmpdir(), `modrinth-loader-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, filename);
    await this.download(url, destination);
    return destination;
  }

  private async download(url: string, destination: string): Promise<void> {
    const response = await axios.get(url, { responseType: 'stream', timeout: 15_000 });
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(destination);
      response.data.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
      response.data.on('error', reject);
    });
  }

  private async verifyHash(filePath: string, hashes: ModrinthIndexFile['hashes']): Promise<void> {
    const expected = hashes.sha512 || hashes.sha1;
    if (!expected) {
      return;
    }

    const algorithm = hashes.sha512 ? 'sha512' : 'sha1';
    const hash = createHash(algorithm);
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: Buffer | string) => { hash.update(chunk); });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });

    const actual = hash.digest('hex');
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${path.basename(filePath)}`);
    }
  }

  private copyDirectory(source: string, destination: string): void {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destinationPath, { recursive: true });
        this.copyDirectory(sourcePath, destinationPath);
        continue;
      }

      if (entry.isFile()) {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.copyFileSync(sourcePath, destinationPath);
      }
    }
  }
}
