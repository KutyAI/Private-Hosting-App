const { spawn } = require('child_process');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const IPC_URL = process.env.IPC_URL || 'ws://localhost:9876';

let passed = 0;
let failed = 0;

async function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const url = new URL(path, API_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function wsCommand(command, params = {}) {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');
    const ws = new WebSocket(IPC_URL);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 'e2e-1', command, params }));
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

async function runTests() {
  console.log('=== E2E Smoke Tests ===\n');

  console.log('1. Backend API Health');
  try {
    const res = await httpRequest('/health');
    await assert(res.status === 200, 'Health endpoint returns 200');
    await assert(res.body.status === 'ok', 'Health status is ok');
  } catch (err) {
    await assert(false, `Health check failed: ${err.message}`);
  }

  console.log('\n2. User Registration');
  let token = null;
  try {
    const res = await httpRequest('/auth/register', 'POST', {
      email: `e2e-${Date.now()}@test.com`,
      password: 'e2etest123',
      display_name: 'E2E Test',
    });
    await assert(res.status === 201, 'Registration returns 201');
    await assert(!!res.body.access_token, 'Registration returns access token');
    token = res.body.access_token;
  } catch (err) {
    await assert(false, `Registration failed: ${err.message}`);
  }

  console.log('\n3. User Login');
  try {
    const res = await httpRequest('/auth/login', 'POST', {
      email: 'test@test.com',
      password: 'test123',
    });
    await assert(res.status === 200, 'Login returns 200');
    await assert(!!res.body.access_token, 'Login returns access token');
  } catch (err) {
    await assert(false, `Login failed: ${err.message}`);
  }

  console.log('\n4. Authenticated Endpoint');
  if (token) {
    try {
      const http = require('http');
      const res = await new Promise((resolve, reject) => {
        const req = http.request(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
        });
        req.on('error', reject);
        req.end();
      });
      await assert(res.status === 200, 'Auth me endpoint returns 200');
    } catch (err) {
      await assert(false, `Auth me failed: ${err.message}`);
    }
  }

  console.log('\n5. Agent IPC Connection');
  try {
    const res = await wsCommand('network.status', {});
    await assert(res.success === true, 'IPC network.status succeeds');
  } catch (err) {
    await assert(false, `IPC failed: ${err.message}`);
  }

  console.log('\n6. Server List via IPC');
  try {
    const res = await wsCommand('server.list', {});
    await assert(res.success === true, 'IPC server.list succeeds');
    await assert(Array.isArray(res.data), 'Server list is an array');
  } catch (err) {
    await assert(false, `Server list failed: ${err.message}`);
  }

  console.log('\n7. Backup List via IPC');
  try {
    const res = await wsCommand('backup.list', { server_id: 'nonexistent' });
    await assert(res.success === true, 'IPC backup.list succeeds');
  } catch (err) {
    await assert(false, `Backup list failed: ${err.message}`);
  }

  console.log('\n8. Rate Limiting');
  try {
    const promises = Array.from({ length: 15 }, () =>
      httpRequest('/auth/login', 'POST', { email: 'x@x.com', password: 'x' })
    );
    const results = await Promise.all(promises);
    const has429 = results.some(r => r.status === 429);
    await assert(has429, 'Rate limiting triggers 429 after rapid requests');
  } catch (err) {
    await assert(false, `Rate limit test failed: ${err.message}`);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
