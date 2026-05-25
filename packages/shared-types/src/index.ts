export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_seen_at: string;
}

export interface Device {
  id: string;
  user_id: string;
  device_public_key: string;
  device_name: string;
  platform: string;
  app_version: string;
  registered_at: string;
  last_online_at: string;
}

export interface Friendship {
  id: string;
  requester_user_id: string;
  addressee_user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  accepted_at?: string;
}

export interface Invite {
  id: string;
  host_user_id: string;
  host_device_id: string;
  server_id: string;
  code: string;
  expires_at: string;
  max_uses: number;
  current_uses: number;
  status: 'active' | 'expired' | 'used_up' | 'revoked';
}

export interface LocalServer {
  id: string;
  name: string;
  server_type: 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge';
  mc_version: string;
  world_path: string;
  memory_min_mb: number;
  memory_max_mb: number;
  max_players: number;
  motd: string;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  auto_restart: boolean;
  status: 'stopped' | 'starting' | 'running' | 'crashed' | 'stopping';
  created_at: string;
  pid?: number;
  port: number;
  java_path?: string;
  loader?: 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge';
  modrinth_project_id?: string;
  modrinth_version_id?: string;
  server_jar_path?: string;
}

export type NotificationEventType =
  | 'server.started'
  | 'server.stopped'
  | 'server.crashed'
  | 'player.joined'
  | 'player.left'
  | 'backup.completed';

export interface NotificationSettings {
  webhook_url: string;
  enabled: boolean;
  username?: string;
  avatar_url?: string;
  enabled_events: Record<NotificationEventType, boolean>;
}

export interface AppSettingsSnapshot {
  maxConcurrentInstances: number;
  useRustProxy: boolean;
}

export type NotificationEvent =
  | {
      type: 'server.started';
      server_id: string;
      server_name: string;
      port: number;
    }
  | {
      type: 'server.stopped';
      server_id: string;
      server_name: string;
      exit_code: number | null;
      signal: string | null;
    }
  | {
      type: 'server.crashed';
      server_id: string;
      server_name: string;
      exit_code: number | null;
      signal: string | null;
      reason: string;
    }
  | {
      type: 'player.joined';
      server_id: string;
      server_name: string;
      player: string;
    }
  | {
      type: 'player.left';
      server_id: string;
      server_name: string;
      player: string;
    }
  | {
      type: 'backup.completed';
      server_id: string;
      server_name: string;
      size_bytes: number;
      path: string;
      source: 'manual' | 'scheduled';
    };

export interface JavaInstallationInfo {
  feature_version: number;
  java_path: string;
  install_dir: string;
  platform: string;
  arch: string;
}

export interface ModrinthSearchResult {
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

export interface ModrinthVersionInfo {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  primary_file_url: string;
  primary_file_name: string;
  primary_file_size: number;
  project_id: string;
  project_title: string;
  project_slug: string;
  project_icon_url?: string;
}

export interface ModrinthInstallResult {
  project_id: string;
  version_id: string;
  title: string;
  mc_version: string;
  loader: 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge';
  loader_version?: string;
  server_jar_path?: string;
  target_dir: string;
}

export interface BackupRecord {
  id: string;
  server_id: string;
  file_path: string;
  size_bytes: number;
  checksum: string;
  created_at: string;
  source: 'manual' | 'scheduled';
}

export interface AccessPolicy {
  server_id: string;
  invite_only: boolean;
  whitelist_enabled: boolean;
  relay_allowed: boolean;
  direct_preferred: boolean;
}

export interface ServerMetrics {
  cpu_percent: number;
  memory_used_mb: number;
  memory_max_mb: number;
  uptime_seconds: number;
  player_count: number;
  max_players: number;
  tps: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'server' | 'agent' | 'tunnel';
}

export interface PresenceInfo {
  device_id: string;
  online: boolean;
  server_status: string;
  player_count: number;
  last_updated: string;
}

export type IPCCommand =
  | 'server.create'
  | 'server.start'
  | 'server.stop'
  | 'server.restart'
  | 'server.delete'
  | 'server.list'
  | 'server.logs.stream'
  | 'server.players.list'
  | 'server.command.send'
  | 'server.metrics.get'
  | 'server.properties.update'
  | 'server.properties.get'
  | 'backup.create'
  | 'backup.list'
  | 'backup.restore'
  | 'backup.delete'
  | 'backup.schedule.set'
  | 'backup.schedule.get'
  | 'backup.schedule.list'
  | 'backup.schedule.remove'
  | 'network.status'
  | 'network.invite.create'
  | 'system.environment.check'
  | 'system.java.ensure'
  | 'settings.app.get'
  | 'settings.app.update'
  | 'network.policy.update'
  | 'network.diagnostics'
  | 'network.test.connectivity'
  | 'settings.notifications.get'
  | 'settings.notifications.update'
  | 'settings.notifications.test'
  | 'modrinth.search'
  | 'modrinth.project.versions'
  | 'modrinth.version.get'
  | 'modrinth.install'
  | 'policy.set'
  | 'policy.get'
  | 'policy.add.device'
  | 'policy.remove.device'
  | 'policy.ban.device'
  | 'policy.check'
  | 'session.start'
  | 'session.stop'
  | 'session.list'
  | 'guest.join'
  | 'guest.leave'
  | 'supabase.metrics.fetch';


export interface IPCRequest {
  id: string;
  command: IPCCommand;
  params?: Record<string, unknown>;
}

export interface IPCResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ServerCreateParams {
  name: string;
  server_type: 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge';
  mc_version: string;
  memory_min_mb: number;
  memory_max_mb: number;
  port?: number;
  auto_port?: boolean;
  auto_restart?: boolean;
  max_players: number;
  motd: string;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  java_path?: string;
  loader?: 'vanilla' | 'paper' | 'fabric' | 'forge' | 'quilt' | 'neoforge';
  modrinth_project_id?: string;
  modrinth_version_id?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SessionNegotiation {
  session_id: string;
  host_device_id: string;
  guest_device_id: string;
  direct_candidates: string[];
  relay_token?: string;
  status: 'negotiating' | 'connected' | 'failed';
}
