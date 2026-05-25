# İmplementasyon Planı

`thinking.md` içindeki 5 geliştirme önerisinin, mevcut repo yapısı (Tauri 2.0 + Node host-agent + Relay) doğrulanarak çıkarılmış uygulama planıdır.

## Mevcut Durum Özeti

- **Host Agent:** `apps/host-agent` — Node 18 + TypeScript, `pkg@5.8.1` ile binary
  - Modüller: `server-manager` (Minecraft proc), `connection-proxy` (TCP), `tunnel-client`, `nat-traversal`, `backup-manager`, `backup-scheduler`, `auth-manager` (Supabase), `ipc-server` (WS:9876), `telemetry`, `policy-enforcer`
- **Desktop UI:** `apps/desktop-ui` — Tauri 2.0, `externalBin: ["bin/host-agent"]`
- **Relay:** `apps/relay-service` — ayrı Node servisi
- **Shared:** `packages/shared-types`

---

## Uygulama Sırası

| # | İş | Süre | Risk |
|---|----|------|------|
| 1 | Discord Webhook | ~1 gün | Düşük |
| 2 | Java Auto-Installer + Modrinth | ~2-3 gün | Düşük |
| 3 | E2EE (Noise, Node tarafında) | ~3-4 gün | Orta |
| 4 | Multi-Instance + Kaynak Limiti | ~3-5 gün | Orta (SQLite migration) |
| 5 | Rust Hot-Path (proxy + tunnel) | ~1-2 hafta | Yüksek |

---

## 1. Discord Webhook Entegrasyonu

**Hedef:** Sunucu olayları (start/stop/crash/player join/leave/backup) konfigüre edilmiş Discord webhook'a embed olarak gönderilsin.

### Yaklaşım
- Yeni modül: `apps/host-agent/src/notifier.ts`
- Olayları `EventEmitter` üzerinden yayınla; `ServerManager`, `BackupScheduler`, `connection-proxy` zaten emit ediyor
- UI'da Settings → "Bildirimler" sekmesi (webhook URL + per-event toggle)
- Webhook URL'i SQLite `settings` tablosunda tut (encrypt: AES-GCM, key OS keychain'de)

### Kod Örneği

```ts
// apps/host-agent/src/notifier.ts
import axios from 'axios';

type NotifyEvent =
  | { type: 'server.started'; serverId: string; serverName: string }
  | { type: 'server.stopped'; serverId: string; serverName: string; exitCode: number }
  | { type: 'server.crashed'; serverId: string; serverName: string; reason: string }
  | { type: 'player.joined'; serverId: string; player: string }
  | { type: 'player.left'; serverId: string; player: string }
  | { type: 'backup.completed'; serverId: string; sizeMB: number; path: string };

interface NotifierConfig {
  webhookUrl: string;
  enabledEvents: Set<NotifyEvent['type']>;
}

const COLORS: Record<NotifyEvent['type'], number> = {
  'server.started':   0x57F287, // green
  'server.stopped':   0x99AAB5, // gray
  'server.crashed':   0xED4245, // red
  'player.joined':    0x5865F2, // blurple
  'player.left':      0xFEE75C, // yellow
  'backup.completed': 0xEB459E, // pink
};

export class DiscordNotifier {
  constructor(private config: NotifierConfig) {}

  async notify(event: NotifyEvent): Promise<void> {
    if (!this.config.enabledEvents.has(event.type)) return;
    if (!this.config.webhookUrl) return;

    const embed = this.buildEmbed(event);
    try {
      await axios.post(this.config.webhookUrl, { embeds: [embed] }, { timeout: 5000 });
    } catch (err) {
      // never throw — telemetry only
      console.warn('[notifier] webhook failed', (err as Error).message);
    }
  }

  private buildEmbed(e: NotifyEvent) {
    const base = { color: COLORS[e.type], timestamp: new Date().toISOString() };
    switch (e.type) {
      case 'server.started':
        return { ...base, title: '🟢 Sunucu başlatıldı', description: `**${e.serverName}** çalışıyor.` };
      case 'server.crashed':
        return { ...base, title: '💥 Sunucu çöktü', description: `**${e.serverName}**\n\`${e.reason}\`` };
      case 'player.joined':
        return { ...base, title: '👋 Oyuncu katıldı', description: `\`${e.player}\` bağlandı.` };
      case 'backup.completed':
        return { ...base, title: '💾 Yedekleme tamamlandı', fields: [
          { name: 'Boyut', value: `${e.sizeMB} MB`, inline: true },
          { name: 'Yol', value: `\`${e.path}\``, inline: false },
        ]};
      // ... others
      default: return { ...base, title: e.type };
    }
  }
}
```

### Entegrasyon Noktaları
- `ServerManager` → child_process `exit` event → `notifier.notify({ type: 'server.stopped' | 'server.crashed', ... })`
- Player join/leave: Minecraft stdout regex (`[Server thread/INFO]: PlayerName joined the game`)
- `BackupManager.createBackup()` sonunda emit

### UI
- Settings sayfasına yeni form + "Webhook'u test et" butonu → örnek embed gönderir

---

## 2. Java Auto-Installer + Modrinth Modpack Entegrasyonu

**Hedef:** Sistem Java'sına dokunmadan, her instance için portable JRE indir. UI'dan Modrinth modpack ara → tek tıkla kur.

### 2a. Java Auto-Installer

#### Yaklaşım
- Adoptium API: `https://api.adoptium.net/v3/assets/latest/{feature_version}/hotspot?architecture={arch}&image_type=jre&os={os}`
- İndirilen `.tar.gz`/`.zip` → `{dataDir}/runtimes/jre-{version}-{os}-{arch}/`
- Cache: aynı sürümü ikinci kez indirme
- Server config'inde `javaPath` boşsa otomatik portable runtime kullan

#### Kod Örneği

```ts
// apps/host-agent/src/java-installer.ts
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import extractZip from 'extract-zip';
// tar.gz için: tar npm paketi (zaten archiver var, ekleme küçük)

interface AdoptiumAsset {
  binary: {
    package: { link: string; checksum: string; name: string };
  };
  version: { semver: string };
}

export class JavaInstaller {
  constructor(private runtimesDir: string) {
    fs.mkdirSync(runtimesDir, { recursive: true });
  }

  async ensureJre(featureVersion: number): Promise<string> {
    const platform = this.getPlatform();   // 'mac' | 'windows' | 'linux'
    const arch = this.getArch();           // 'x64' | 'aarch64'
    const installDir = path.join(this.runtimesDir, `jre-${featureVersion}-${platform}-${arch}`);
    const javaBin = this.javaBinPath(installDir);

    if (fs.existsSync(javaBin)) return javaBin;

    const url = `https://api.adoptium.net/v3/assets/latest/${featureVersion}/hotspot` +
                `?architecture=${arch}&image_type=jre&os=${platform}&vendor=eclipse`;
    const { data } = await axios.get<AdoptiumAsset[]>(url);
    if (!data.length) throw new Error(`Adoptium: JRE ${featureVersion} bulunamadı`);

    const asset = data[0].binary.package;
    const tmpFile = path.join(os.tmpdir(), asset.name);

    await this.download(asset.link, tmpFile);
    await this.verifyChecksum(tmpFile, asset.checksum);

    fs.mkdirSync(installDir, { recursive: true });
    if (tmpFile.endsWith('.zip')) {
      await extractZip(tmpFile, { dir: installDir });
    } else {
      // tar.gz extraction
      const tar = require('tar');
      await tar.x({ file: tmpFile, cwd: installDir });
    }
    fs.unlinkSync(tmpFile);

    return this.javaBinPath(installDir);
  }

  private javaBinPath(installDir: string): string {
    // Adoptium yapısı: jdk-XX-jre/Contents/Home/bin/java (mac) veya jdk-XX-jre/bin/java
    const entries = fs.readdirSync(installDir);
    const root = path.join(installDir, entries[0] || '');
    const isMac = process.platform === 'darwin';
    return isMac
      ? path.join(root, 'Contents', 'Home', 'bin', 'java')
      : path.join(root, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  }

  private async verifyChecksum(file: string, expected: string): Promise<void> {
    const hash = crypto.createHash('sha256');
    await new Promise<void>((res, rej) =>
      fs.createReadStream(file).on('data', d => hash.update(d)).on('end', res).on('error', rej));
    const actual = hash.digest('hex');
    if (actual !== expected) throw new Error(`Checksum mismatch: ${actual} != ${expected}`);
  }

  private async download(url: string, dest: string): Promise<void> {
    const resp = await axios.get(url, { responseType: 'stream' });
    await new Promise<void>((res, rej) => {
      resp.data.pipe(fs.createWriteStream(dest)).on('finish', res).on('error', rej);
    });
  }

  private getPlatform(): string {
    return { darwin: 'mac', win32: 'windows', linux: 'linux' }[process.platform] || 'linux';
  }
  private getArch(): string {
    return process.arch === 'arm64' ? 'aarch64' : 'x64';
  }
}
```

#### `server-manager.ts` Entegrasyonu

```ts
// startServer içinde:
const javaPath = config.javaPath
  || await this.javaInstaller.ensureJre(this.requiredJavaVersion(config.minecraftVersion));
const proc = spawn(javaPath, ['-Xmx' + config.maxRam, '-Xms' + config.minRam, '-jar', 'server.jar', 'nogui'], { ... });
```

Java sürüm haritası: MC 1.17-1.20.4 → Java 17, 1.20.5+ → Java 21, eski → Java 8

### 2b. Modrinth Entegrasyonu

#### API Akışı
1. Arama: `GET https://api.modrinth.com/v2/search?query={q}&facets=[["project_type:modpack"]]`
2. Sürüm listesi: `GET /v2/project/{slug}/version`
3. Modpack `.mrpack` indir → ZIP içinde `modrinth.index.json` var:

```json
{
  "files": [
    { "path": "mods/sodium.jar", "downloads": ["https://cdn.modrinth.com/..."], "hashes": {"sha1": "..."} }
  ],
  "dependencies": { "minecraft": "1.20.1", "fabric-loader": "0.15.0" }
}
```

#### Kod Örneği

```ts
// apps/host-agent/src/modpack-installer.ts
import axios from 'axios';
import extractZip from 'extract-zip';
import * as fs from 'fs';
import * as path from 'path';

interface ModrinthIndex {
  formatVersion: number;
  game: 'minecraft';
  dependencies: Record<string, string>;
  files: Array<{
    path: string;
    hashes: { sha1: string; sha512?: string };
    downloads: string[];
    fileSize: number;
  }>;
}

export class ModpackInstaller {
  async searchModrinth(query: string) {
    const { data } = await axios.get('https://api.modrinth.com/v2/search', {
      params: { query, facets: JSON.stringify([['project_type:modpack']]), limit: 20 },
    });
    return data.hits;
  }

  async installModrinthPack(versionId: string, targetDir: string,
                            onProgress: (pct: number, msg: string) => void): Promise<{ loader: string; mcVersion: string }> {
    onProgress(0, 'Modpack metadata alınıyor');
    const { data: version } = await axios.get(`https://api.modrinth.com/v2/version/${versionId}`);
    const primary = version.files.find((f: any) => f.primary) || version.files[0];

    const packPath = path.join(targetDir, '_modpack.mrpack');
    await this.download(primary.url, packPath);

    onProgress(20, 'Modpack açılıyor');
    const extractDir = path.join(targetDir, '_modpack_extract');
    await extractZip(packPath, { dir: extractDir });

    const index: ModrinthIndex = JSON.parse(
      fs.readFileSync(path.join(extractDir, 'modrinth.index.json'), 'utf-8'));

    // overrides/ klasörü doğrudan kopyalanır
    const overrides = path.join(extractDir, 'overrides');
    if (fs.existsSync(overrides)) this.copyDir(overrides, targetDir);

    onProgress(40, `${index.files.length} dosya indiriliyor`);
    let done = 0;
    for (const file of index.files) {
      const out = path.join(targetDir, file.path);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await this.download(file.downloads[0], out);
      await this.verifySha1(out, file.hashes.sha1);
      done++;
      onProgress(40 + Math.floor((done / index.files.length) * 50), `${file.path}`);
    }

    onProgress(95, 'Loader belirleniyor');
    const loader = this.detectLoader(index.dependencies);
    const mcVersion = index.dependencies.minecraft;

    fs.unlinkSync(packPath);
    fs.rmSync(extractDir, { recursive: true });

    onProgress(100, 'Tamamlandı');
    return { loader, mcVersion };
  }

  private detectLoader(deps: Record<string, string>): string {
    if (deps['fabric-loader']) return 'fabric';
    if (deps['forge']) return 'forge';
    if (deps['quilt-loader']) return 'quilt';
    if (deps['neoforge']) return 'neoforge';
    return 'vanilla';
  }
  // download / verifySha1 / copyDir — uygulanır
}
```

> Loader server.jar'ı için ek adım gerekir (Fabric installer indirip çalıştırma). İlk iterasyonda Modrinth modpack metadatasındaki `loader` bilgisinden installer URL'i türet.

---

## 3. Uçtan Uca Şifreleme (Noise Protocol)

**Hedef:** Relay üzerinden geçen Minecraft trafiği relay operatörü için bile opak olsun.

### Yaklaşım
- **Pattern:** Noise IK — host'un static public key'i pairing sırasında guest'e iletilir, guest ephemeral kullanır
- **Kütüphane:** `noise-protocol` (npm, pure JS) veya `@chainsafe/noise` (libp2p, daha aktif)
- Pairing flow: host SQLite'a uzun ömürlü `(static_pub, static_priv)` yazar; UI'da pairing kodu/QR ile public key + invite token guest'e ulaşır (zaten mevcut Supabase invite akışı kullanılabilir)
- `tunnel-client` ve `connection-proxy` her bağlantı için bir Noise handshake yapar; sonrasında frame layer: `[u16 len][ciphertext]`

### Kod İskeleti

```ts
// apps/host-agent/src/crypto/noise-session.ts
import { HandshakeState, CipherState } from '@chainsafe/noise'; // veya noise-protocol

export interface NoiseKeys {
  staticPub: Uint8Array;
  staticPriv: Uint8Array;
}

export class NoiseSession {
  private send!: CipherState;
  private recv!: CipherState;

  static async hostHandshake(localKeys: NoiseKeys, firstMsgFromGuest: Buffer): Promise<{
    session: NoiseSession;
    response: Buffer;
  }> {
    const hs = new HandshakeState({
      pattern: 'IK',
      role: 'responder',
      staticKey: { publicKey: localKeys.staticPub, privateKey: localKeys.staticPriv },
    });
    hs.readMessage(firstMsgFromGuest);                  // -> e, es, s, ss
    const response = hs.writeMessage(Buffer.alloc(0));  // <- e, ee, se
    const [send, recv] = hs.split();
    const s = new NoiseSession();
    s.send = send; s.recv = recv;
    return { session: s, response };
  }

  encrypt(plaintext: Buffer): Buffer { return this.send.encryptWithAd(Buffer.alloc(0), plaintext); }
  decrypt(ciphertext: Buffer): Buffer { return this.recv.decryptWithAd(Buffer.alloc(0), ciphertext); }
}
```

### Frame Layer

```ts
// apps/host-agent/src/crypto/framed-stream.ts
import { Transform } from 'stream';

export function encryptFrames(session: NoiseSession): Transform {
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const ct = session.encrypt(chunk);
      const len = Buffer.alloc(2); len.writeUInt16BE(ct.length, 0);
      cb(null, Buffer.concat([len, ct]));
    },
  });
}

export function decryptFrames(session: NoiseSession): Transform {
  let buf = Buffer.alloc(0);
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      buf = Buffer.concat([buf, chunk]);
      const out: Buffer[] = [];
      while (buf.length >= 2) {
        const len = buf.readUInt16BE(0);
        if (buf.length < 2 + len) break;
        out.push(session.decrypt(buf.slice(2, 2 + len)));
        buf = buf.slice(2 + len);
      }
      cb(null, Buffer.concat(out));
    },
  });
}
```

### `connection-proxy.ts` Entegrasyonu

```ts
// pipe sırası: localSocket <-> decryptFrames <-> minecraftSocket <-> encryptFrames <-> localSocket
localSocket
  .pipe(decryptFrames(session))
  .pipe(minecraftSocket);
minecraftSocket
  .pipe(encryptFrames(session))
  .pipe(localSocket);
```

### Test
- Relay servisini ortada tutan bir fixture: relay'in `bytesIn/bytesOut` buffer'larını yakala, içerikte Minecraft handshake byte pattern'i (`0x00 0x10 ...`) **bulunmadığını** assert et

---

## 4. Çoklu Sunucu (Multi-Instance) + Kaynak Limiti

**Hedef:** Aynı anda N adet Minecraft sunucusu, her biri farklı RAM/port/dataDir.

### Mevcut Durum
`server-manager.ts` zaten `Map<string, RunningServer>` tutuyor — yani teknik altyapı **çoklu çalışabiliyor**. Eksik olanlar:
1. UI'da tek-instance varsayımı
2. Port çakışma koruması
3. Per-instance RAM limit ayarı UI'da
4. SQLite şemasında muhtemelen tek-instance varsayan kısımlar (`settings`, `backup_schedule`)

### Adımlar

1. **Şema migration** (`apps/host-agent/src/migrations/`):

```sql
-- Yeni alanlar
ALTER TABLE servers ADD COLUMN min_ram_mb INTEGER NOT NULL DEFAULT 1024;
ALTER TABLE servers ADD COLUMN max_ram_mb INTEGER NOT NULL DEFAULT 2048;
ALTER TABLE servers ADD COLUMN local_port INTEGER NOT NULL DEFAULT 25565;
ALTER TABLE servers ADD COLUMN java_path TEXT;
ALTER TABLE servers ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0;

-- backup_schedule zaten server_id FK'liyse OK
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
```

2. **Port allocator:**

```ts
// apps/host-agent/src/port-allocator.ts
import * as net from 'net';

export async function findFreePort(preferred: number, exclude: Set<number>): Promise<number> {
  if (!exclude.has(preferred) && await isFree(preferred)) return preferred;
  for (let p = 25565; p < 25700; p++) {
    if (exclude.has(p)) continue;
    if (await isFree(p)) return p;
  }
  throw new Error('No free port in 25565-25700');
}

function isFree(port: number): Promise<boolean> {
  return new Promise(res => {
    const srv = net.createServer().once('error', () => res(false))
      .once('listening', () => { srv.close(); res(true); }).listen(port, '127.0.0.1');
  });
}
```

3. **UI:** Sidebar'da instance listesi, her satır `[start][stop][settings][delete]`. "Yeni instance" wizard → version, loader, RAM slider, port (auto), modpack opsiyonu

4. **Concurrent limit:** `settings.maxConcurrentInstances` (default 3). `startServer` öncesi running sayısını kontrol et

---

## 5. Rust Hot-Path (Connection-Proxy + Tunnel-Client)

**Hedef:** En sıcak yolu (TCP proxy + relay tüneli) Rust'a taşıyarak boyut ve throughput kazancı. Kontrol düzlemi Node'da kalsın.

### Mimari Karar
**Hibrit yaklaşım:** Node host-agent'ı ana orkestrasyon olarak tut. Yeni Rust binary'yi (`mc-relay-proxy`) Node bir alt-sidecar olarak başlatsın. IPC: stdin/stdout JSON line-delimited (basit, hızlı, debug edilebilir).

```
Tauri UI
  └─ host-agent (Node)             ← Supabase auth, SQLite, backups, server-manager
      ├─ minecraft (java child)
      └─ mc-relay-proxy (Rust)     ← TCP proxy + Noise + relay tunnel
```

Bu kararla sidecar boyutu tam düşmez (Node hâlâ orada) ama hot path RAM/CPU kazanır. Tam Rust geçişi v0.4+ için ayrılır.

### Cargo Workspace

```
apps/host-agent-rs/
  Cargo.toml
  src/
    main.rs
    ipc.rs            ← stdin/stdout protocol
    proxy.rs          ← tokio TcpListener + copy_bidirectional
    noise.rs          ← snow crate
    tunnel.rs         ← tokio-tungstenite relay client
```

### Kod İskeleti

```toml
# Cargo.toml
[package]
name = "mc-relay-proxy"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
snow = "0.9"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
```

```rust
// src/main.rs
use tokio::io::{AsyncBufReadExt, BufReader};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_writer(std::io::stderr).init();

    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();

    while let Some(line) = lines.next_line().await? {
        match serde_json::from_str::<ipc::Command>(&line) {
            Ok(cmd) => ipc::handle(cmd).await,
            Err(e)  => tracing::warn!("bad cmd: {}", e),
        }
    }
    Ok(())
}
```

```rust
// src/proxy.rs
use tokio::net::{TcpListener, TcpStream};
use tokio::io::copy_bidirectional;

pub async fn start_proxy(listen_port: u16, mc_port: u16) -> anyhow::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", listen_port)).await?;
    tracing::info!("proxy listening on {}", listen_port);

    loop {
        let (mut inbound, peer) = listener.accept().await?;
        tokio::spawn(async move {
            let mut outbound = TcpStream::connect(("127.0.0.1", mc_port)).await?;
            // ileride: Noise handshake burada
            let (rx, tx) = copy_bidirectional(&mut inbound, &mut outbound).await?;
            tracing::debug!(peer = %peer, rx, tx, "conn closed");
            Ok::<_, anyhow::Error>(())
        });
    }
}
```

```rust
// src/ipc.rs
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Command {
    StartProxy { server_id: String, listen_port: u16, mc_port: u16 },
    StopProxy  { server_id: String },
    SetRelay   { url: String, token: String, host_static_pub: String },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    ProxyStarted   { server_id: String },
    ConnectionOpened  { server_id: String, peer: String },
    ConnectionClosed  { server_id: String, peer: String, bytes_in: u64, bytes_out: u64 },
    Error             { message: String },
}

pub async fn handle(cmd: Command) {
    // dispatch -> spawn proxy tasks, track JoinHandles in a global Mutex<HashMap>
}
```

### Node Tarafı

```ts
// apps/host-agent/src/rust-proxy-client.ts
import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { EventEmitter } from 'events';

export class RustProxyClient extends EventEmitter {
  private proc!: ChildProcess;

  start(binPath: string) {
    this.proc = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = readline.createInterface({ input: this.proc.stdout! });
    rl.on('line', line => {
      try { this.emit('event', JSON.parse(line)); }
      catch { /* log */ }
    });
    this.proc.stderr!.on('data', d => console.error('[rust]', d.toString()));
  }

  send(cmd: object) { this.proc.stdin!.write(JSON.stringify(cmd) + '\n'); }

  startProxy(serverId: string, listenPort: number, mcPort: number) {
    this.send({ type: 'start_proxy', server_id: serverId, listen_port: listenPort, mc_port: mcPort });
  }
}
```

### Build Pipeline
- `apps/host-agent-rs/` için GitHub Actions matrix: `macos-13` (x64), `macos-14` (arm64), `windows-latest`, `ubuntu-latest`
- Çıktı: `bin/mc-relay-proxy-{target}` → mevcut release workflow'a entegre
- Tauri `externalBin`'e bu binary'i de ekle (alternatif: Node host-agent kendi klasöründen yüklesin)

### Migrasyon Riski Azaltma
- **Feature flag:** `settings.useRustProxy` (default `false` ilk release'te)
- Aynı protokol/davranış, paralel test → bir minor release sonra default'a al → bir sonraki major'da Node `connection-proxy`'yi kaldır

---

## Test Stratejisi (Tümü için)

- Her modül için Jest unit test (`apps/host-agent/test/`)
- E2E senaryo: `scripts/e2e/` altında headless host + guest simülatörü
  - **#3 E2EE:** relay önyüzünden okunan byte'larda plaintext yokluğu kanıtı
  - **#2 Java:** Adoptium mock server ile checksum başarısızlığında düzgün hata
  - **#4 Multi-instance:** aynı anda 3 sunucu açılıp portların çakışmadığı

---

## Açık Sorular

1. Discord webhook URL'ini hangi key store'da tutalım? (OS keychain vs SQLite + AES)
2. CurseForge desteği bu turda atlanıyor — onaylar mısın?
3. E2EE için pairing UX: mevcut Supabase invite token'ına host public key'i ekleyelim mi, yoksa ayrı bir QR akışı mı?
4. Rust hot-path'i full Rust geçişine çevirme kararı v0.4 milestone'unda mı?
