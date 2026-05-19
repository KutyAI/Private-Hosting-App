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
  server_type: 'vanilla' | 'paper';
  mc_version: string;
  world_path: string;
  memory_min_mb: number;
  memory_max_mb: number;
  auto_restart: boolean;
  status: 'stopped' | 'starting' | 'running' | 'crashed' | 'stopping';
  created_at: string;
  pid?: number;
  port: number;
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
  | 'network.policy.update'
  | 'network.diagnostics'
  | 'network.test.connectivity'
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
  | 'guest.leave';

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
  server_type: 'vanilla' | 'paper';
  mc_version: string;
  memory_min_mb: number;
  memory_max_mb: number;
  port: number;
  max_players: number;
  motd: string;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
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
