const http = require('http');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10');
const REQUESTS = parseInt(process.env.REQUESTS || '100');

async function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runLoadTest(path, method = 'GET', body = null) {
  console.log(`\nLoad testing: ${method} ${path}`);
  console.log(`Concurrency: ${CONCURRENCY}, Total requests: ${REQUESTS}\n`);

  const latencies = [];
  const errors = [];
  const statusCodes = {};

  const batches = Math.ceil(REQUESTS / CONCURRENCY);

  for (let b = 0; b < batches; b++) {
    const batchSize = Math.min(CONCURRENCY, REQUESTS - b * CONCURRENCY);
    const promises = Array.from({ length: batchSize }, async () => {
      const start = performance.now();
      try {
        const res = await makeRequest(path, method, body);
        const latency = performance.now() - start;
        latencies.push(latency);

        statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;

        if (res.status >= 400) {
          errors.push(`HTTP ${res.status}: ${res.body}`);
        }
      } catch (err) {
        errors.push(err.message);
      }
    });

    await Promise.allSettled(promises);
  }

  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log('Results:');
  console.log(`  Total requests: ${REQUESTS}`);
  console.log(`  Errors: ${errors.length} (${((errors.length / REQUESTS) * 100).toFixed(1)}%)`);
  console.log(`  Average latency: ${avg.toFixed(1)}ms`);
  console.log(`  p50 latency: ${p50.toFixed(1)}ms`);
  console.log(`  p95 latency: ${p95.toFixed(1)}ms`);
  console.log(`  p99 latency: ${p99.toFixed(1)}ms`);
  console.log(`  Status codes: ${JSON.stringify(statusCodes)}`);

  if (errors.length > 0) {
    console.log(`\nSample errors:`);
    errors.slice(0, 5).forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
  }

  return { latencies, errors, statusCodes };
}

async function main() {
  console.log('=== MC Hosting Load Tests ===');

  await runLoadTest('/health');
  await runLoadTest('/auth/register', 'POST', {
    email: `loadtest${Date.now()}@test.com`,
    password: 'test123',
    display_name: 'Load Test',
  });

  console.log('\n=== Load tests complete ===');
}

main().catch(console.error);
