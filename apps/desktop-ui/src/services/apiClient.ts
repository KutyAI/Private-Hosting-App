import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const deviceId = localStorage.getItem('device_id');
  if (deviceId) {
    config.headers['X-Device-ID'] = deviceId;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retried) {
      original._retried = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refresh });
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.reload();
        }
      }
    }
    return Promise.reject(err);
  }
);

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return data;
}

export async function register(email: string, password: string, display_name: string) {
  const { data } = await api.post('/auth/register', { email, password, display_name });
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return data;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

export async function getMe() {
  const { data } = await api.get('/auth/me');
  return data;
}

export async function registerDevice(deviceName: string, deviceKey: string) {
  const { data } = await api.post('/devices/register', {
    device_name: deviceName,
    device_public_key: deviceKey,
    platform: 'windows',
    app_version: '0.1.0',
  });
  localStorage.setItem('device_id', data.id);
  return data;
}

export async function sendFriendRequest(friendEmail: string) {
  const { data } = await api.post('/friends/request', { friend_email: friendEmail });
  return data;
}

export async function acceptFriendRequest(friendshipId: string) {
  const { data } = await api.post('/friends/accept', { friendship_id: friendshipId });
  return data;
}

export async function listFriends() {
  const { data } = await api.get('/friends/list');
  return data;
}

export async function listSentFriendRequests() {
  const { data } = await api.get('/friends/requests/sent');
  return data;
}

export async function cancelFriendRequest(friendshipId: string) {
  const { data } = await api.delete(`/friends/requests/${friendshipId}`);
  return data;
}

export async function createInvite(serverId: string, maxUses?: number, expiresHours?: number) {
  const { data } = await api.post(`/friends/${serverId}/invites`, {
    max_uses: maxUses,
    expires_in_hours: expiresHours,
  });
  return data;
}

export async function joinInvite(code: string) {
  const { data } = await api.post(`/friends/${code}/join`);
  return data;
}

export async function sendPresenceHeartbeat(serverStatus?: string, playerCount?: number) {
  const deviceId = localStorage.getItem('device_id');
  if (!deviceId) return;
  await api.post('/presence/heartbeat', {
    device_id: deviceId,
    server_status: serverStatus || 'offline',
    player_count: playerCount || 0,
  });
}

export default api;
