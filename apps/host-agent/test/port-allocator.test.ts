import { findFreePort, isPortFree } from '../src/port-allocator';
import * as net from 'net';

describe('port-allocator', () => {
  it('returns the preferred port when it is free', async () => {
    const port = await findFreePort(29999);
    expect(port).toBe(29999);
  });

  it('skips excluded ports and finds another', async () => {
    const excluded = new Set([25565, 25566, 25567]);
    const port = await findFreePort(25565, excluded);
    expect(excluded.has(port)).toBe(false);
    expect(port).toBeGreaterThan(0);
  });

  it('detects a listening port as taken', async () => {
    const srv = net.createServer();
    await new Promise<void>((res) => srv.listen(29001, '127.0.0.1', res));
    try {
      const free = await isPortFree(29001);
      expect(free).toBe(false);
    } finally {
      await new Promise<void>((res, rej) => srv.close((e) => (e ? rej(e) : res())));
    }
  });

  it('correctly identifies a genuinely free port', async () => {
    const free = await isPortFree(29002);
    expect(free).toBe(true);
  });
});
