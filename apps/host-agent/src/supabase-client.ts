import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export async function updateDevicePresence(
  supabase: SupabaseClient,
  deviceId: string,
  updates: { public_ip?: string; public_port?: number; nat_type?: string }
): Promise<void> {
  const { error } = await supabase
    .from('devices')
    .update({ ...updates, last_online_at: new Date().toISOString() })
    .eq('id', deviceId);
  if (error) console.error('Failed to update presence:', error.message);
}

export async function getInviteByCode(supabase: SupabaseClient, code: string): Promise<any> {
  const { data, error } = await supabase
    .from('invites')
    .select('*, devices(*)')
    .eq('code', code)
    .eq('status', 'active')
    .single();
  if (error) return null;
  return data;
}

export async function incrementInviteUsage(supabase: SupabaseClient, inviteId: string): Promise<void> {
  const { data: invite } = await supabase
    .from('invites')
    .select('current_uses, max_uses')
    .eq('id', inviteId)
    .single();

  if (invite) {
    const newUses = invite.current_uses + 1;
    await supabase
      .from('invites')
      .update({
        current_uses: newUses,
        status: newUses >= invite.max_uses ? 'expired' : 'active',
      })
      .eq('id', inviteId);
  }
}

export async function getHostDeviceInfo(supabase: SupabaseClient, deviceId: string): Promise<any> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('id', deviceId)
    .single();
  if (error) return null;
  return data;
}
