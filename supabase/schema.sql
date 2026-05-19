-- MC Hosting Platform - Supabase Database Schema
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/_/sql
--
-- This schema replaces the local SQLite backend with a cloud database
-- that supports multi-user authentication, invites, and presence.

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

-- ============================================
-- DEVICES
-- ============================================
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  device_public_key text NOT NULL,
  device_name text NOT NULL DEFAULT '',
  platform text DEFAULT 'windows',
  app_version text DEFAULT '0.1.0',
  public_ip text,
  public_port int DEFAULT 25565,
  nat_type text DEFAULT 'unknown',
  registered_at timestamptz DEFAULT now(),
  last_online_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_last_online ON devices(last_online_at);

-- ============================================
-- INVITES
-- ============================================
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  host_device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  server_id text NOT NULL,
  code text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  max_uses int DEFAULT 10,
  current_uses int DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_host ON invites(host_user_id);

-- ============================================
-- FRIENDSHIPS
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  addressee_user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(requester_user_id, addressee_user_id)
);

CREATE INDEX idx_friendships_requester ON friendships(requester_user_id);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_user_id);

-- ============================================
-- RELAY ALLOCATIONS (for fallback connections)
-- ============================================
CREATE TABLE IF NOT EXISTS relay_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  host_device_id uuid REFERENCES devices(id),
  guest_device_id uuid REFERENCES devices(id),
  allocated_at timestamptz DEFAULT now(),
  released_at timestamptz,
  bytes_in bigint DEFAULT 0,
  bytes_out bigint DEFAULT 0
);

CREATE INDEX idx_relay_session ON relay_allocations(session_id);

-- ============================================
-- AUDIT EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  target_type text,
  target_id text,
  event_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_actor ON audit_events(actor_user_id);
CREATE INDEX idx_audit_created ON audit_events(created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- Devices are readable by authenticated users (for presence)
CREATE POLICY "devices_read_all" ON devices
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "devices_insert_own" ON devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "devices_update_own" ON devices
  FOR UPDATE USING (auth.uid() = user_id);

-- Invites are readable by anyone with the code
CREATE POLICY "invites_read" ON invites
  FOR SELECT USING (true);

CREATE POLICY "invites_insert" ON invites
  FOR INSERT WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "invites_update" ON invites
  FOR UPDATE USING (auth.uid() = host_user_id);

-- Friendships can only be managed by the involved users
CREATE POLICY "friendships_read" ON friendships
  FOR SELECT USING (auth.uid() = requester_user_id OR auth.uid() = addressee_user_id);

CREATE POLICY "friendships_insert" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_user_id);

CREATE POLICY "friendships_update" ON friendships
  FOR UPDATE USING (auth.uid() = requester_user_id OR auth.uid() = addressee_user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-create user profile on first sign-in
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on Supabase auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-increment invite usage
CREATE OR REPLACE FUNCTION public.increment_invite_usage()
RETURNS trigger AS $$
BEGIN
  UPDATE public.invites
  SET current_uses = current_uses + 1,
      status = CASE WHEN current_uses + 1 >= max_uses THEN 'expired' ELSE status END
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CLEANUP OLD DATA (run periodically)
-- ============================================
-- DELETE FROM invites WHERE expires_at < now() - interval '7 days';
-- DELETE FROM relay_allocations WHERE released_at < now() - interval '24 hours';
-- DELETE FROM audit_events WHERE created_at < now() - interval '30 days';
