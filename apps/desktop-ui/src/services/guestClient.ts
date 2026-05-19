export interface SessionInfo {
  sessionId: string;
  hostDeviceId: string;
  relayUrl: string;
  directCandidates: string[];
}

export async function joinServer(inviteCode: string, apiUrl: string): Promise<SessionInfo> {
  const response = await fetch(`${apiUrl}/friends/${inviteCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to join');
  }

  const data = await response.json();
  return {
    sessionId: data.session_id || inviteCode,
    hostDeviceId: data.host_device_id,
    relayUrl: data.relay_url || `wss://relay.mchosting.local/relay/${data.session_id}`,
    directCandidates: data.direct_candidates || [],
  };
}
