# Supabase Setup Guide

## Step 1: Create Supabase Account (Free, No Credit Card)

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (recommended) or email
4. No credit card required

## Step 2: Create a New Project

1. Click "New Project"
2. Choose a project name (e.g., "mc-hosting")
3. Set a strong database password (save it!)
4. Choose a region closest to you (US East recommended)
5. Click "Create new project" (takes ~2 minutes)

## Step 3: Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql` from this project
4. Paste it into the SQL Editor
5. Click **Run** (or press Ctrl+Enter)

You should see "Success. No rows returned" for each statement.

## Step 4: Get Your API Credentials

1. Go to **Project Settings** (gear icon, bottom left)
2. Go to **API** section
3. Copy these two values:
   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon public** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 5: Configure the App

Create `.env` in `apps/desktop-ui/`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Create `.env` in `apps/host-agent/`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Step 6: Configure Auth Settings

1. Go to **Authentication** → **Providers** in Supabase dashboard
2. Enable **Email** provider
3. Disable "Confirm email" (for development) — users can sign up without email verification
4. Set "Site URL" to `http://localhost:3000`

## Step 7: Test It

```bash
npm run dev
```

Open http://localhost:3000 and:
1. Click "Create Account"
2. Enter email + password
3. You should be logged in and see the dashboard

## Step 8: Build the Installer

```bash
npm run tauri:build -w apps/desktop-ui
```

Output: `apps/desktop-ui/src-tauri/target/release/bundle/nsis/MC.Hosting_0.1.0_x64-setup.exe`

---

## Troubleshooting

### "Invalid API key" error
- Make sure you copied the **anon public** key (not the service_role key)
- Check that `.env` files have the correct values

### "Row Level Security" errors
- Make sure you ran the entire `supabase/schema.sql` script
- Check that RLS policies are enabled on all tables

### Email confirmation required
- Go to Authentication → Providers → Email
- Disable "Confirm email" toggle
- Save changes
