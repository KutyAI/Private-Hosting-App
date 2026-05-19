const WebSocket = require('ws');
const { performance } = require('perf_hooks');

const RELAY_URL = process.env.RELAY_URL || 'ws://localhost:8443/relay/test-session';
const SESSIONS = parseInt(process.env.SESSIONS || '10');
const MESSAGES_PER_SESSION = parseInt(process.env.MESSAGES || '100');
const MESSAGE_SIZE = parseInt(process.env.MSG_SIZE || '1024');

async function testRelaySession(sessionId) {
  const hostUrl = `${RELAY_URL.replace(/\/relay\/.*/, `/relay/${sessionId}`)}?role=host`;
  const guestUrl = `${RELAY_URL.replace(/\/relay\/.*/, `/relay/${sessionId}`)}?role=guest`;

  return new Promise((resolve) => {
    const host = new WebSocket(hostUrl);
    const guest = new WebSocket(guestUrl);
    let hostReady = false;
    let guestReady = false;
    let messagesReceived = 0;
    const latencies = [];
    const startTime = performance.now();

    host.on('open', () => { hostReady = true; checkReady(); });
    guest.on('open', () => { guestReady = true; checkReady(); });

    function checkReady() {
      if (hostReady && guestReady) {
        let sent = 0;
        const payload = Buffer.alloc(MESSAGE_SIZE, 'x');

        guest.on('message', (data) => {
          const latency = performance.now() - startTime;
          latencies.push(latency);
          messagesReceived++;

          if (messagesReceived >= MESSAGES_PER_SESSION) {
            host.close();
            guest.close();
            resolve({ latencies, messagesReceived });
          }
        });

        const sendInterval = setInterval(() => {
          if (sent >= MESSAGES_PER_SESSION) {
            clearInterval(sendInterval);
            return;
          }
          host.send(payload);
          sent++;
        }, 10);
      }
    }

    host.on('error', (err) => resolve({ error: err.message, latencies: [] }));
    guest.on('error', (err) => resolve({ error: err.message, latencies: [] }));

    setTimeout(() => {
      host.close();
      guest.close();
      resolve({ error: 'Timeout', latencies });
    }, 30000);
  });
}

async function main() {
  console.log('=== Relay Service Load Tests ===');
  console.log(`Sessions: ${SESSIONS}, Messages: ${MESSAGES_PER_SESSION}, Size: ${MESSAGE_SIZE}B\n`);

  const results = [];

  for (let i = 0; i < SESSIONS; i++) {
    const sessionId = `load-test-${i}-${Date.now()}`;
    console.log(`Testing session ${i + 1}/${SESSIONS}...`);
    const result = await testRelaySession(sessionId);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else {
      const avg = result.latencies.reduce((a, b) => a + b, 0) / result.latencies.length;
      console.log(`  Messages: ${result.messagesReceived}, Avg latency: ${avg.toFixed(1)}ms`);
      results.push(result);
    }
  }

  const allLatencies = results.flatMap(r => r.latencies);
  if (allLatencies.length > 0) {
    allLatencies.sort((a, b) => a - b);
    const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
    const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)];
    const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)];

    console.log('\nOverall Results:');
    console.log(`  Total messages: ${allLatencies.length}`);
    console.log(`  p50: ${p50.toFixed(1)}ms, p95: ${p95.toFixed(1)}ms, p99: ${p99.toFixed(1)}ms`);
  }

  console.log('\n=== Relay tests complete ===');
}

main().catch(console.error);
