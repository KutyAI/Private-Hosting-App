import { useState, useEffect } from 'react';
import { Copy, Plus, Users, Check, X, Play, Square, Globe, Wifi, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { createInvite, joinInvite, sendFriendRequest, listFriends, ensureDeviceRegistered } from '../../services/supabaseClient';
import { useAppStore } from '../../stores/appStore';
import { sendIPCCommand } from '../../services/ipcClient';

interface Friend {
  id: string;
  friend_id: string;
  friend_email: string;
  friend_name: string;
  status: string;
}

interface ActiveSession {
  server_id: string;
  local_proxy_port: number;
  active_connections: number;
}

export function Access() {
  const { isAuthenticated } = useAuthStore();
  const { servers, selectedServer, setSelectedServer } = useAppStore();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendEmail, setFriendEmail] = useState('');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isHosting, setIsHosting] = useState(false);
  const [joinStatus, setJoinStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [joinProxyPort, setJoinProxyPort] = useState<number | null>(null);

  useEffect(() => {
    if (isAuthenticated) loadFriends();
    loadSessions();
  }, [isAuthenticated, selectedServer]);

  async function loadFriends() {
    try {
      const list = await listFriends();
      setFriends(list || []);
    } catch {}
  }

  async function loadSessions() {
    try {
      const result = await sendIPCCommand<ActiveSession[]>('session.list', {});
      setActiveSessions(result || []);
      if (selectedServer) {
        const session = (result || []).find(s => s.server_id === selectedServer);
        setIsHosting(!!session);
      }
      const guestSession = (result || []).find(s => s.server_id.startsWith('guest-'));
      if (guestSession) {
        setJoinStatus('connected');
        setJoinProxyPort(guestSession.local_proxy_port);
      } else if (joinStatus === 'connected') {
        setJoinStatus('idle');
        setJoinProxyPort(null);
      }
    } catch {}
  }

  async function handleCreateInvite() {
    if (!selectedServer) {
      setMessage('Select a server first');
      return;
    }
    setLoading(true);
    try {
      let result;
      if (isAuthenticated) {
        const status = await sendIPCCommand<{ device_id: string; device_name: string }>('network.status', {});
        const deviceId = status?.device_id;
        const deviceName = status?.device_name || 'Local Device';
        
        if (!deviceId) {
          throw new Error('Local Device ID could not be retrieved from the host agent.');
        }

        await ensureDeviceRegistered(deviceId, deviceName);
        result = await createInvite(deviceId, selectedServer, 10, 24);
      } else {
        result = await sendIPCCommand<{ code: string; expires_at: string }>('network.invite.create', {});
      }
      setInviteCode(result.code);
      setInviteExpiry(result.expires_at || '');
      setMessage('');
    } catch (err: any) {
      setMessage(err.response?.data?.error || err.message || 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      setMessage('Copied to clipboard!');
      setTimeout(() => setMessage(''), 2000);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setLoading(true);
    setJoinStatus('connecting');
    setMessage('Connecting to server...');

    try {
      const localProxyPort = 25566;
      const result = await sendIPCCommand<{ local_proxy_port: number }>('guest.join', {
        invite_code: joinCode.trim(),
        local_proxy_port: localProxyPort,
      });

      setJoinStatus('connected');
      setJoinProxyPort(result.local_proxy_port);
      setMessage(`Connected! Add localhost:${result.local_proxy_port} in Minecraft and play!`);
    } catch (err: any) {
      setMessage(err.message || 'Failed to join');
      setJoinStatus('failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      await sendIPCCommand('guest.leave', { invite_code: joinCode.trim() });
      setJoinStatus('idle');
      setJoinProxyPort(null);
      setMessage('Disconnected from server.');
    } catch (err: any) {
      setMessage(err.message || 'Failed to disconnect');
    }
  }

  async function handleAddFriend() {
    if (!friendEmail.trim()) return;
    setLoading(true);
    try {
      await sendFriendRequest(friendEmail.trim());
      setMessage('Friend request sent!');
      setFriendEmail('');
      setShowAddFriend(false);
      loadFriends();
    } catch (err: any) {
      setMessage(err.response?.data?.error || err.message || 'Failed to send request');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartHosting() {
    if (!selectedServer) {
      setMessage('Select a server first');
      return;
    }
    try {
      const server = servers.find(s => s.id === selectedServer);
      const result = await sendIPCCommand<{ local_proxy_port: number }>('session.start', {
        server_id: selectedServer,
        local_proxy_port: (server?.port || 25565) + 10000,
      });
      setIsHosting(true);
      setMessage(`Hosting started! Remote players can connect via invite code.`);
      loadSessions();
    } catch (err: any) {
      setMessage(err.message || 'Failed to start hosting');
    }
  }

  async function handleStopHosting() {
    if (!selectedServer) return;
    try {
      await sendIPCCommand('session.stop', { server_id: selectedServer });
      setIsHosting(false);
      setMessage('Hosting stopped');
      loadSessions();
    } catch (err: any) {
      setMessage(err.message || 'Failed to stop hosting');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-800 p-4 rounded-lg">
        <h2 className="text-2xl font-bold">Access Control</h2>
        <select
          value={selectedServer || ''}
          onChange={(e) => setSelectedServer(e.target.value || null)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white min-w-[250px] outline-none focus:border-emerald-500 transition-colors"
        >
          <option value="">Select a server...</option>
          {servers.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.server_type})</option>
          ))}
        </select>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes('Failed') || message.includes('error') || message.includes('not') || message.includes('Disconnected')
            ? 'bg-red-500/20 text-red-400'
            : 'bg-emerald-500/20 text-emerald-400'
        }`}>
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            Host a Server
          </h3>

          {selectedServer ? (
            <div className="space-y-4">
              <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Server</span>
                  <span className="font-medium">{servers.find(s => s.id === selectedServer)?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Status</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    isHosting
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-gray-600 text-gray-300'
                  }`}>
                    {isHosting ? 'Hosting Active' : 'Not Hosting'}
                  </span>
                </div>
              </div>

              <button
                onClick={isHosting ? handleStopHosting : handleStartHosting}
                className={`w-full py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  isHosting
                    ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isHosting ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isHosting ? 'Stop Hosting' : 'Start Hosting'}
              </button>

              {isHosting && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <p className="text-sm text-emerald-400 mb-2">Your server is accessible to remote players!</p>
                  <p className="text-xs text-gray-400">Share an invite code so friends can connect.</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Please select a server from the dropdown above to start hosting.</p>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5 text-blue-400" />
            Join a Server
          </h3>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter invite code"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 uppercase font-mono"
                maxLength={12}
              />
              <button
                onClick={handleJoin}
                disabled={loading || !joinCode.trim() || joinStatus === 'connected'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {joinStatus === 'connecting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : 'Join'}
              </button>
            </div>

            {joinStatus === 'connected' && joinProxyPort && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p className="text-sm text-emerald-400 mb-2">Connected! Add this server in Minecraft:</p>
                <div className="flex items-center justify-between bg-gray-900 rounded p-2 mb-3">
                  <code className="text-lg font-mono text-emerald-400">localhost:{joinProxyPort}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`localhost:${joinProxyPort}`); }}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  In Minecraft: Multiplayer → Add Server → Address: <code className="text-emerald-400">localhost</code>, Port: <code className="text-emerald-400">{joinProxyPort}</code>
                </p>
                <button
                  onClick={handleDisconnect}
                  className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            )}

            {joinStatus === 'failed' && (
              <p className="text-sm text-red-400">Failed to connect. Check the invite code and try again.</p>
            )}

            {joinStatus === 'idle' && (
              <p className="text-xs text-gray-500">Enter an invite code to join a friend's server.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            Invite Friends
          </h3>
          <button
            onClick={handleCreateInvite}
            disabled={loading || !selectedServer}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Generate Code
          </button>
        </div>

        {inviteCode && (
          <div className="p-4 bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <code className="text-xl font-mono text-emerald-400">{inviteCode}</code>
              <button
                onClick={handleCopy}
                className="p-2 hover:bg-gray-600 rounded transition-colors"
                title="Copy"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            {inviteExpiry && (
              <p className="text-xs text-gray-400">
                Expires: {new Date(inviteExpiry).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>

      {activeSessions.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Active Sessions ({activeSessions.length})
          </h3>
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <div key={session.server_id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <div className="font-medium">{servers.find(s => s.id === session.server_id)?.name || session.server_id}</div>
                  <div className="text-sm text-gray-400">Proxy port: {session.local_proxy_port}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="w-3 h-3" />
                    {session.active_connections} connected
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Friends ({friends.length})
          </h3>
          <button
            onClick={() => setShowAddFriend(!showAddFriend)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Friend
          </button>
        </div>

        {showAddFriend && (
          <div className="mb-4 p-4 bg-gray-700/50 rounded-lg">
            <div className="flex gap-2">
              <input
                type="email"
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                placeholder="Friend's email"
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleAddFriend}
                disabled={loading || !friendEmail.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded-lg text-sm"
              >
                Send Request
              </button>
              <button
                onClick={() => { setShowAddFriend(false); setFriendEmail(''); }}
                className="p-2 hover:bg-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {friends.length === 0 ? (
          <div className="text-gray-400 text-center py-6">
            No friends yet. Add friends by their email to easily invite them.
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <div className="font-medium">{friend.friend_name}</div>
                  <div className="text-sm text-gray-400">{friend.friend_email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Check className="w-3 h-3" />
                    Connected
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
