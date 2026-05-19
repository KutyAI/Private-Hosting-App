const { performance } = require('perf_hooks');

const WARMUP_RUNS = 3;
const BENCHMARK_RUNS = 10;

function benchmark(name, fn) {
  for (let i = 0; i < WARMUP_RUNS; i++) fn();

  const latencies = [];
  for (let i = 0; i < BENCHMARK_RUNS; i++) {
    const start = performance.now();
    fn();
    latencies.push(performance.now() - start);
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log(`${name}:`);
  console.log(`  avg: ${avg.toFixed(2)}ms, p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);

  return { avg, p50, p95, p99 };
}

async function main() {
  console.log('=== Performance Benchmarks ===\n');

  benchmark('JSON parse/stringify (1KB)', () => {
    const obj = { a: 1, b: 'test', c: [1, 2, 3], d: { nested: true } };
    const str = JSON.stringify(obj);
    JSON.parse(str);
  });

  benchmark('Map set/get (1000 entries)', () => {
    const map = new Map();
    for (let i = 0; i < 1000; i++) map.set(`key-${i}`, `value-${i}`);
    for (let i = 0; i < 1000; i++) map.get(`key-${i}`);
  });

  benchmark('Array push (10000 items)', () => {
    const arr = [];
    for (let i = 0; i < 10000; i++) arr.push(i);
  });

  benchmark('String concat (1000 items)', () => {
    let str = '';
    for (let i = 0; i < 1000; i++) str += `item-${i},`;
  });

  benchmark('Regex match (1000 lines)', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `[INFO] Line ${i}: some log message`);
    const regex = /\[(WARN|ERROR)\]/;
    for (const line of lines) regex.test(line);
  });

  benchmark('File write (10KB)', () => {
    const fs = require('fs');
    const path = require('path');
    const tmpPath = path.join(require('os').tmpdir(), `bench-${Date.now()}.tmp`);
    const data = 'x'.repeat(10240);
    fs.writeFileSync(tmpPath, data);
    fs.unlinkSync(tmpPath);
  });

  console.log('\n=== Benchmarks complete ===');
}

main().catch(console.error);
