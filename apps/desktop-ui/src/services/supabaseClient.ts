import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const SUPABASE_PLACEHOLDER_KEY = 'placeholder-key';

const getSupabaseUrl = (): string => {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('CUSTOM_SUPABASE_URL');
      if (saved) return saved.trim();
    }
  } catch {}
  return import.meta.env.VITE_SUPABASE_URL?.trim() || '';
};

const getSupabaseAnonKey = (): string => {
  try {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('CUSTOM_SUPABASE_ANON_KEY');
      if (saved) return saved.trim();
    }
  } catch {}
  return import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

export const supabase: SupabaseClient = createClient(
  supabaseUrl || SUPABASE_PLACEHOLDER_URL,
  supabaseAnonKey || SUPABASE_PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

interface ErrorWithMessage {
  message: string;
}

function hasMessage(error: unknown): error is ErrorWithMessage {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string';
}

export function getSupabaseConfigurationError(): string | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) {
    return 'Authentication is not configured for this desktop build. Please configure your Supabase URL and Anon Key in Settings.';
  }

  if (url === SUPABASE_PLACEHOLDER_URL || key === SUPABASE_PLACEHOLDER_KEY) {
    return 'Authentication is still using placeholder Supabase values. Please update your Supabase URL and Anon Key in Settings.';
  }

  return null;
}

function assertSupabaseConfigured(): void {
  const configurationError = getSupabaseConfigurationError();
  if (configurationError) {
    throw new Error(configurationError);
  }
}

export function getReadableAuthError(error: unknown): string {
  const configurationError = getSupabaseConfigurationError();
  if (configurationError) {
    return configurationError;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (!hasMessage(error)) {
    return 'Authentication failed. Please try again.';
  }

  const message = error.message.trim();
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('networkerror')
    || normalizedMessage.includes('network request failed')
  ) {
    return 'Unable to reach the authentication service. Check your connection and make sure the desktop app is allowed to make network requests.';
  }

  if (normalizedMessage.includes('invalid login credentials') || normalizedMessage.includes('invalid email or password')) {
    return 'Invalid email or password.';
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Check your email and confirm your account before signing in.';
  }

  if (normalizedMessage.includes('signup is disabled')) {
    return 'Sign up is disabled for this Supabase project.';
  }

  if (normalizedMessage.includes('invalid api key')) {
    return 'Supabase rejected the anon key. Verify your Supabase URL and Anon Key in Settings.';
  }

  return message || 'Authentication failed. Please try again.';
}

export async function signUp(email: string, password: string, displayName: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  });
  if (error) throw new Error(getReadableAuthError(error));
  return data;
}

export async function signIn(email: string, password: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(getReadableAuthError(error));
  return data;
}

export async function signOut() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  assertSupabaseConfigured();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    if (error.name === 'AuthSessionMissingError' || error.message?.includes('Auth session missing')) {
      return null;
    }
    throw error;
  }
  return user;
}

export async function onAuthStateChange(callback: (session: Session | null) => void) {
  assertSupabaseConfigured();
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return subscription;
}

export async function registerDevice(deviceName: string, devicePublicKey: string) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('devices')
    .insert({
      user_id: user.id,
      device_name: deviceName,
      device_public_key: devicePublicKey,
      platform: 'windows',
      app_version: '0.1.0',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function ensureDeviceRegistered(deviceId: string, deviceName: string) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existingDevice } = await supabase
    .from('devices')
    .select('id')
    .eq('id', deviceId)
    .maybeSingle();

  if (existingDevice) {
    return existingDevice;
  }

  const { data, error } = await supabase
    .from('devices')
    .insert({
      id: deviceId,
      user_id: user.id,
      device_name: deviceName,
      device_public_key: 'local-dev-key',
      platform: 'windows',
      app_version: '0.1.0',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDevices() {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('last_online_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateDevicePresence(deviceId: string, updates: { public_ip?: string; public_port?: number; nat_type?: string }) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from('devices')
    .update({ ...updates, last_online_at: new Date().toISOString() })
    .eq('id', deviceId);
  if (error) throw error;
}

export async function sendFriendRequest(friendEmail: string) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: friendUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', friendEmail)
    .single();

  if (!friendUser) throw new Error('User not found');
  if (friendUser.id === user.id) throw new Error('Cannot add yourself');

  const { data, error } = await supabase
    .from('friendships')
    .insert({
      requester_user_id: user.id,
      addressee_user_id: friendUser.id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptFriendRequest(friendshipId: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

interface FriendshipRow {
  id: string;
  status: string;
  created_at: string;
  requester_user_id: string;
  addressee_user_id: string;
  users?: { id: string; email: string; display_name: string } | { id: string; email: string; display_name: string }[];
  'users!requester_user_id'?: { id: string; email: string; display_name: string } | { id: string; email: string; display_name: string }[];
  'users!addressee_user_id'?: { id: string; email: string; display_name: string } | { id: string; email: string; display_name: string }[];
}

function resolveFriendUser(
  friendship: FriendshipRow,
  currentUserId: string,
): { id: string; email: string; display_name: string } | undefined {
  let friend = friendship.requester_user_id === currentUserId
    ? friendship['users!addressee_user_id']
    : friendship['users!requester_user_id'];

  if (!friend && friendship.users) {
    friend = friendship.users;
  }

  if (Array.isArray(friend)) {
    return friend[0];
  }

  return friend;
}

export async function listFriends() {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id,
      status,
      created_at,
      requester_user_id,
      addressee_user_id,
      users!requester_user_id (id, email, display_name),
      users!addressee_user_id (id, email, display_name)
    `)
    .or(`requester_user_id.eq.${user.id},addressee_user_id.eq.${user.id}`);

  if (error) throw error;

  return (data as FriendshipRow[] || []).map((friendship) => {
    const friend = resolveFriendUser(friendship, user.id);

    return {
      id: friendship.id,
      friend_id: friend?.id,
      friend_email: friend?.email,
      friend_name: friend?.display_name,
      status: friendship.status,
      created_at: friendship.created_at,
      direction: friendship.requester_user_id === user.id ? 'sent' as const : 'received' as const,
    };
  });
}

export async function listSentFriendRequests() {
  const friendships = await listFriends();
  return friendships.filter(
    (friendship) => friendship.direction === 'sent' && friendship.status === 'pending',
  );
}

export async function cancelFriendRequest(friendshipId: string) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('requester_user_id', user.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Friend request not found');
  return data;
}

export async function createInvite(hostDeviceId: string, serverId: string, maxUses = 10, expiresHours = 24) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('invites')
    .insert({
      host_user_id: user.id,
      host_device_id: hostDeviceId,
      server_id: serverId,
      code,
      expires_at: expiresAt,
      max_uses: maxUses,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function joinInvite(code: string) {
  assertSupabaseConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: invite, error: inviteError } = await supabase
    .from('invites')
    .select('*, devices(*)')
    .eq('code', code)
    .eq('status', 'active')
    .single();

  if (inviteError || !invite) throw new Error('Invalid or expired invite code');
  if (new Date(invite.expires_at) < new Date()) throw new Error('Invite code expired');
  if (invite.current_uses >= invite.max_uses) throw new Error('Invite code max uses reached');

  await supabase
    .from('invites')
    .update({ current_uses: invite.current_uses + 1 })
    .eq('id', invite.id);

  return {
    session_id: invite.id,
    host_device_id: invite.host_device_id,
    host_user_id: invite.host_user_id,
    device: invite.devices,
  };
}

export async function updatePresence(deviceId: string, online: boolean) {
  assertSupabaseConfigured();
  await supabase
    .from('devices')
    .update({ last_online_at: new Date().toISOString() })
    .eq('id', deviceId);
}

export async function signInWithOAuth(provider: 'github' | 'google') {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw new Error(getReadableAuthError(error));
  return data;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MINE-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
