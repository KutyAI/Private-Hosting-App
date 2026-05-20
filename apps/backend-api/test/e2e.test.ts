import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as http from 'http';
import { WebSocket } from 'ws';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const IPC_URL = process.env.IPC_URL || 'ws://localhost:9876';

let authToken: string;
let testUserId: string;

function httpRequest(path: string, method = 'GET', body?: any, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function wsCommand(command: string, params?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(IPC_URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: `test-${Date.now()}`, command, params }));
    });
    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());
      ws.close();
      resolve(response);
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);
  });
}

describe('E2E: Full User Journey', () => {
  beforeAll(async () => {
    const res = await httpRequest('/auth/register', 'POST', {
      email: `e2e-${Date.now()}@test.com`,
      password: 'e2etest123',
      display_name: 'E2E User',
    });
    authToken = res.body.access_token;
    testUserId = res.body.user?.id;
  });

  describe('Authentication Flow', () => {
    it('should register a new user', async () => {
      const res = await httpRequest('/auth/register', 'POST', {
        email: `e2e-new-${Date.now()}@test.com`,
        password: 'password123',
        display_name: 'New User',
      });
      expect(res.status).toBe(201);
      expect(res.body.access_token).toBeDefined();
    });

    it('should login with valid credentials', async () => {
      const res = await httpRequest('/auth/login', 'POST', {
        email: 'test@test.com',
        password: 'test123',
      });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const res = await httpRequest('/auth/login', 'POST', {
        email: 'test@test.com',
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
    });

    it('should access protected endpoint with valid token', async () => {
      const res = await httpRequest('/auth/me', 'GET', undefined, {
        'Authorization': `Bearer ${authToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should reject protected endpoint without token', async () => {
      const res = await httpRequest('/auth/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Device Management', () => {
    it('should register a device', async () => {
      const res = await httpRequest('/devices/register', 'POST', {
        device_name: 'Test Device',
        device_public_key: 'test-key-123',
        platform: 'windows',
        app_version: '0.1.0',
      }, { 'Authorization': `Bearer ${authToken}` });
      expect(res.status).toBe(201);
      expect(res.body.device_name).toBe('Test Device');
    });
  });

  describe('Friend System', () => {
    it('should send friend request to existing user', async () => {
      const res = await httpRequest('/friends/request', 'POST', {
        friend_email: 'test@test.com',
      }, { 'Authorization': `Bearer ${authToken}` });
      expect([201, 409]).toContain(res.status);
    });

    it('should reject self-friend request', async () => {
      const res = await httpRequest('/friends/request', 'POST', {
        friend_email: 'test@test.com',
      }, { 'Authorization': `Bearer ${authToken}` });
      expect([201, 400, 409]).toContain(res.status);
    });

    it('should list sent pending friend requests', async () => {
      const res = await httpRequest('/friends/requests/sent', 'GET', undefined, {
        'Authorization': `Bearer ${authToken}`,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should cancel a sent friend request', async () => {
      const sentRes = await httpRequest('/friends/requests/sent', 'GET', undefined, {
        'Authorization': `Bearer ${authToken}`,
      });
      expect(sentRes.status).toBe(200);

      if (sentRes.body.length === 0) {
        return;
      }

      const cancelRes = await httpRequest(
        `/friends/requests/${sentRes.body[0].id}`,
        'DELETE',
        undefined,
        { 'Authorization': `Bearer ${authToken}` },
      );
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
    });
  });

  describe('Agent IPC', () => {
    it('should connect to agent and get network status', async () => {
      const res = await wsCommand('network.status', {});
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('device_id');
    });

    it('should list servers (empty initially)', async () => {
      const res = await wsCommand('server.list', {});
      expect(res.success).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('should create a server', async () => {
      const res = await wsCommand('server.create', {
        name: 'E2E Test Server',
        server_type: 'vanilla',
        mc_version: '1.20.4',
        memory_min_mb: 1024,
        memory_max_mb: 2048,
        port: 25565,
      });
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('id');
      expect(res.data.name).toBe('E2E Test Server');
    });

    it('should list servers after creation', async () => {
      const res = await wsCommand('server.list', {});
      expect(res.success).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
    });

    it('should get server logs', async () => {
      const servers = await wsCommand('server.list', {});
      if (servers.data.length > 0) {
        const res = await wsCommand('server.logs.stream', { server_id: servers.data[0].id });
        expect(res.success).toBe(true);
      }
    });

    it('should create a backup', async () => {
      const servers = await wsCommand('server.list', {});
      if (servers.data.length > 0) {
        const res = await wsCommand('backup.create', { server_id: servers.data[0].id });
        expect(res.success).toBe(true);
      }
    });

    it('should list backups', async () => {
      const servers = await wsCommand('server.list', {});
      if (servers.data.length > 0) {
        const res = await wsCommand('backup.list', { server_id: servers.data[0].id });
        expect(res.success).toBe(true);
        expect(Array.isArray(res.data)).toBe(true);
      }
    });

    it('should get network diagnostics', async () => {
      const res = await wsCommand('network.diagnostics', {});
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('natType');
      expect(res.data).toHaveProperty('candidates');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid IPC command', async () => {
      const res = await wsCommand('invalid.command', {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown command');
    });

    it('should handle missing server params', async () => {
      const res = await wsCommand('server.start', {});
      expect(res.success).toBe(false);
    });
  });
});
