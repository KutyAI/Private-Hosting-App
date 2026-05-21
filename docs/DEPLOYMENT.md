# MC Hosting - Deployment Guide

## Making It a Desktop App

### Option 1: Tauri (Recommended - ~15MB installer)

Tauri creates a native Windows app with a tiny footprint using the system WebView2.

**Prerequisites:**
- Rust: `winget install Rustlang.Rustup`
- Visual Studio Build Tools with C++ workload
- WebView2 Runtime (pre-installed on Windows 11)

**Build the installer:**
```bash
npm run tauri:build -w apps/desktop-ui
```

**Output:** `apps/desktop-ui/src-tauri/target/release/bundle/nsis/MC.Hosting_0.1.0_x64-setup.exe`

**Install:** Run the `.exe` - it installs the app and registers the Windows service.

### Option 2: Electron (~150MB installer)

If you need broader compatibility or specific Electron APIs:

```bash
# Replace Tauri with Electron in package.json
npm install electron electron-builder --save-dev -w apps/desktop-ui
npm run build:electron -w apps/desktop-ui
```

### Option 3: Web App (No install needed)

Users can access the UI directly in their browser:
```bash
npm run dev:ui  # Development
npm run build -w apps/desktop-ui && npx serve apps/desktop-ui/dist  # Production
```

---

## Making It Work on Remote Networks

### Architecture Overview

```
┌─────────────────────┐         Internet         ┌─────────────────────┐
│   HOST (You)        │◄────────────────────────►│   GUEST (Friend)    │
│                     │                          │                     │
│  MC Hosting App     │                          │  MC Hosting App     │
│  ├─ Desktop UI      │                          │  ├─ Desktop UI      │
│  ├─ Host Agent      │                          │  ├─ Guest Client    │
│  └─ Minecraft Srv   │                          │  └─ Minecraft Client│
└─────────┬───────────┘                          └─────────┬───────────┘
          │                                                │
          └────────────► Relay Server ◄────────────────────┘
                       (Cloud VPS)
```

### Step 1: Deploy the Backend API

Deploy to any cloud provider (AWS, DigitalOcean, Fly.io):

```bash
# Using Docker
cd apps
docker-compose up -d backend-api
```

**Or manually:**
```bash
# On a VPS (Ubuntu)
apt install nodejs npm postgresql redis
git clone <repo>
cd mc-hosting
npm install
npm run build -w packages/shared-types
npm run build -w apps/backend-api

# Set environment variables
export JWT_SECRET=$(openssl rand -hex 32)
export API_PORT=3001
export DATABASE_URL=postgresql://user:pass@localhost/mchosting

# Start with PM2
npm install -g pm2
pm2 start apps/backend-api/dist/index.js --name "mc-hosting-api"
pm2 save
```

### Step 2: Deploy the Relay Server

The relay server enables connections between users behind NAT/firewalls:

```bash
# On a VPS with good bandwidth (100Mbps+)
cd apps/relay-service
npm install
npm run build

# Set environment
export RELAY_PORT=8443
export RELAY_MAX_SESSIONS=1000

# Start
pm2 start dist/server.js --name "mc-hosting-relay"
pm2 save
```

**Relay server requirements:**
- 2+ CPU cores
- 4GB+ RAM
- 100Mbps+ bandwidth
- Public IP address
- Open ports: 8443 (WebSocket)

### Step 3: Configure the Desktop App

The desktop application is built with a dual-configuration architecture:
1. **Zero-Config Consumer Presets (Pre-Baked)**: When compiling production binaries, environment variables starting with `VITE_` are statically compiled directly into the client's asset bundles. This creates a zero-setup out-of-the-box user experience.
2. **Dynamic Runtime Overrides**: Self-hosters can override these defaults at runtime without compiling their own installer. They can do this inside the app's Settings drawer under the **App Connections** tab.

For releasing a pre-configured client, configure the environment files prior to compilation:

Create `.env` in `apps/desktop-ui/`:
```env
# Cloud authentication, presence tracking, and OAuth provider host
VITE_SUPABASE_URL=https://your-production-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key

# Control Plane API & WebSocket Tunnel Relays
VITE_API_URL=https://api.mchosting.local
VITE_RELAY_URL=wss://relay.mchosting.local:8443
```

Create `.env` in `apps/host-agent/`:
```env
API_URL=https://api.mchosting.local
RELAY_URL=wss://relay.mchosting.local:8443
IPC_PORT=9876
```

---

### Step 4: Compile and Package Installers

Use our automated build wizards to compile all services, package Node.js agent executable sidecars, and bundle the final native desktop installers.

#### A. Building for Windows (Creates `.exe` Installer)
Run the Windows automated packaging batch script:
```cmd
# Execute in terminal or double-click from file manager
scripts\build-installer.bat
```
- **Build Output**: `apps/desktop-ui/src-tauri/target/release/bundle/nsis/MC Hosting_0.1.0_x64-setup.exe`
- **Installer Actions**: Installs the desktop GUI client, extracts the compiled Windows-native Node.js sidecar agent, and provisions required local proxy listeners.

#### B. Building for macOS (Creates `.dmg` / `.app` Bundles)
Run the macOS automated compilation shell script:
```bash
chmod +x scripts/build-installer.sh
./scripts/build-installer.sh
```
- The build script automatically packages native agent sidecars for **both** macOS platforms:
  - Apple Silicon (`aarch64-apple-darwin` for M1 / M2 / M3 / M4 processors)
  - Intel (`x86_64-apple-darwin` for legacy Intel processors)
- If both architectures are installed in Rust (via `rustup target add aarch64-apple-darwin x86_64-apple-darwin`), the script automatically compiles a single **Universal macOS Bundle** (`.dmg` and `.app`) that runs natively on all macOS systems! Otherwise, it builds a native bundle for your current CPU.
- **Build Output**: `apps/desktop-ui/src-tauri/target/release/bundle/dmg/MC Hosting_0.1.0_universal.dmg` (or `_aarch64.dmg` / `_x64.dmg` depending on targets)


### Step 5: User Flow

**Host (You):**
1. Install MC Hosting from the `.exe`
2. Sign in or create account
3. Create and start a Minecraft server
4. Click "Start Hosting" in the Access tab
5. Generate an invite code and share it

**Guest (Friend):**
1. Install MC Hosting from the `.exe`
2. Sign in or create account
3. Go to Access tab → Enter invite code → Click "Join"
4. Add `localhost:25566` as a server in Minecraft
5. Connect and play!

---

## Code Signing (For Windows SmartScreen)

To avoid "Windows protected your PC" warnings:

1. Purchase a code signing certificate (~$500-800/year)
   - DigiCert, Sectigo, or GlobalSign
   - OV or EV certificate

2. Configure in `tauri.conf.json`:
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

3. Build:
```bash
npm run tauri:build -w apps/desktop-ui
```

---

## Auto-Update Setup

1. Host update metadata on your server:
```json
// https://updates.mchosting.local/windows/x86_64/0.1.0
{
  "version": "0.2.0",
  "notes": "New features and bug fixes",
  "pub_date": "2026-04-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVk...",
      "url": "https://releases.mchosting.local/v0.2.0/MC.Hosting_0.2.0_x64-setup.exe"
    }
  }
}
```

2. The Tauri updater plugin handles the rest automatically.

---

## Production Checklist

- [ ] Backend API deployed to cloud with HTTPS
- [ ] PostgreSQL database provisioned
- [ ] Redis cache provisioned
- [ ] Relay server deployed with 100Mbps+ bandwidth
- [ ] Domain names configured (api.mchosting.local, relay.mchosting.local)
- [ ] SSL certificates installed (Let's Encrypt)
- [ ] Code signing certificate purchased
- [ ] Windows installer built and signed
- [ ] Auto-update endpoint configured
- [ ] Privacy policy and Terms of Service published
- [ ] Monitoring/alerting configured (Datadog, Grafana)
- [ ] Backup strategy for database
