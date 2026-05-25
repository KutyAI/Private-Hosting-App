import * as net from 'net';

export async function findFreePort(preferred: number, exclude: Set<number> = new Set()): Promise<number> {
  if (!exclude.has(preferred) && await isPortFree(preferred)) {
    return preferred;
  }

  const ranges: Array<[number, number]> = [
    [25565, 25700],
    [30000, 31000],
  ];

  for (const [start, end] of ranges) {
    for (let port = start; port <= end; port++) {
      if (exclude.has(port)) {
        continue;
      }

      if (await isPortFree(port)) {
        return port;
      }
    }
  }

  throw new Error('No free port available in the configured ranges');
}

export function isPortFree(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}
