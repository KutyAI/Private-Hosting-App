# Supabase & Authentication Setup Guide

This guide describes how to configure your Supabase instance to manage database states, presence tracking, and Google & GitHub social authentication.

---

## 🛠️ Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and click **Start your project**.
2. Sign in with your GitHub account or Email.
3. Click **New Project** and configure:
   - **Project Name**: e.g., `mc-hosting`
   - **Database Password**: Set a strong, secure password (save it safely!).
   - **Region**: Choose a region closest to your main player base (e.g., `US East` or `Central Europe`).
4. Click **Create new project** (takes approximately 2 minutes).

---

## 🗄️ Step 2: Initialize the Database Schema

1. In your Supabase Dashboard, navigate to the **SQL Editor** tab (represented by a `SQL` query terminal icon on the left sidebar).
2. Click **New Query**.
3. Copy the entire contents of the schema file in the repository:
   - [supabase/schema.sql](file:///Users/kutay/Desktop/gh/Private-Hosting-App/supabase/schema.sql)
4. Paste it into the query workspace.
5. Click **Run** (or press `Ctrl + Enter` / `Cmd + Enter`).
6. Verify that the output states: `"Success. No rows returned"` for each table, policy, and trigger initialization.

---

## 🔐 Step 3: Configure Authentication Providers

To support instant, secure registration and logins for your desktop players, enable and configure the following providers in the Supabase Dashboard under **Authentication** → **Providers**:

### 📧 1. Email Provider
1. Locate **Email** in the providers list and toggle it **On**.
2. **Disable "Confirm email"** (for ease of development/testing) to allow users to sign up instantly without clicking validation links. If distributing in standard production, you may toggle this on.
3. Click **Save**.

### 🐙 2. GitHub OAuth Provider
1. Go to your [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps** → click **Register a new application**.
2. Fill out the application profile:
   - **Application Name**: e.g., `MC Hosting App`
   - **Homepage URL**: `https://supabase.com` (or your project URL)
   - **Authorization callback URL**: Copy the callback URL provided by your Supabase Dashboard under **Authentication** → **Providers** → **GitHub** (e.g., `https://<your-project-id>.supabase.co/auth/v1/callback`).
3. Click **Register application**.
4. Copy the generated **Client ID**.
5. Click **Generate a new client secret** and copy the resulting secret immediately.
6. Return to your Supabase Dashboard under **GitHub Provider**:
   - Toggle it **On**.
   - Paste your **Client ID** and **Client Secret**.
   - Click **Save**.

### 🔑 3. Google OAuth Provider
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project.
3. Go to **APIs & Services** → **OAuth consent screen**. Set user type to **External**, enter your app details, and save.
4. Go to **Credentials** → **Create Credentials** → select **OAuth client ID**.
5. Configure the credentials:
   - **Application type**: Web application
   - **Name**: e.g., `MC Hosting Client`
   - **Authorized redirect URIs**: Copy the callback URL provided by your Supabase Dashboard under **Authentication** → **Providers** → **Google** (e.g., `https://<your-project-id>.supabase.co/auth/v1/callback`).
6. Click **Create**.
7. Copy the generated **Client ID** and **Client Secret**.
8. Return to your Supabase Dashboard under **Google Provider**:
   - Toggle it **On**.
   - Paste your **Client ID** and **Client Secret**.
   - Click **Save**.

---

## 🔀 Step 4: Configure Crucial Redirection URLs

Because Tauri is a compiled desktop shell, it serves files using custom native protocol wrappers rather than standard HTTP servers. For social logins to return users safely to the running application, you **must** register these URLs in Supabase.

1. In the Supabase Dashboard, go to **Authentication** → **URL Configuration**.
2. **Site URL**:
   - Set this to: `http://localhost:3000` (for local development testing).
3. **Redirect URLs**:
   - Click **Add URL** and register **all three** of the following exact addresses:
     ```
     tauri://localhost
     https://tauri.localhost
     http://localhost:3000
     ```
     - > [!IMPORTANT]
       > - `tauri://localhost` is utilized on macOS and Linux Tauri production bundles.
       > - `https://tauri.localhost` is utilized on Windows Tauri production bundles.
       > - `http://localhost:3000` is utilized during hot-reload development.
4. Click **Save**.

---

## 🚀 Step 5: Understanding the Release & Connection Architecture

Our desktop app is designed to provide a perfect bifurcated workflow: a completely zero-config consumer experience, alongside a flexible self-hoster development pathway.

### 📦 A. Zero-Config End-User Releases (Pre-Baked Keys)
- When compiling production installers using the build scripts (`build-installer.sh` or `build-installer.bat`), the frontend environment variables located in `apps/desktop-ui/.env` are **statically baked** directly into the client's Javascript bundles at compilation.
- **How to Release**:
  1. Set the production Supabase URL and Key in `apps/desktop-ui/.env`:
     ```env
     VITE_SUPABASE_URL=https://your-production-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-production-anon-key
     VITE_API_URL=http://localhost:3001
     ```
  2. Run the build script (e.g., `./scripts/build-installer.sh` or `scripts/build-installer.bat`).
  3. The resulting `.dmg` or `.exe` is packaged with these credentials.
  4. End users can install and run the application immediately with **zero configuration** required! They can register, log in via Google/GitHub, and host/join servers instantly.

### ⚙️ B. Dynamic Runtime Overrides (For Self-Hosters)
- Advanced users who want to host their own custom database, backend control plane, or network relays do not need to rebuild or recompile the desktop application!
- **How to Override**:
  1. Open **MC Hosting** and click the **Settings** gear icon in the bottom-left sidebar.
  2. Select the **App Connections** tab.
  3. Enter custom values for the **API URL**, **Supabase Project URL**, and **Supabase Anon Key**.
  4. Click **Apply Connection Settings**.
  5. The application immediately writes these to local storage, overriding the pre-baked defaults dynamically on that specific device.
  6. To revert to the developer's default settings, simply click the **Reset to Defaults** button.

---

## 🔍 Troubleshooting

### ❌ Redirection loops or auth errors inside Tauri
- Double-check that `tauri://localhost` and `https://tauri.localhost` are exactly typed inside **Authentication** → **URL Configuration** → **Redirect URLs** in your Supabase Dashboard.
- Ensure that the social providers (GitHub / Google) are fully enabled and their client secrets are saved.

### ❌ "Invalid API Key" or connection failure
- Check if your custom keys contain trailing spaces or incorrect characters.
- If you made manual overrides, open the **App Connections** Settings tab and click **Reset to Defaults** to clear the cache.
