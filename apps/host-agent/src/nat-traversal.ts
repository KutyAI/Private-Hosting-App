import * as dgram from 'dgram';
import * as os from 'os';

export interface StunCandidate {
  type: 'host' | 'srflx' | 'relay';
  address: string;
  port: number;
  protocol: 'udp' | 'tcp';
}

const STUN_SERVERS = [
  { host: 'stun.l.google.com', port: 19302 },
  { host: 'stun1.l.google.com', port: 19302 },
  { host: 'stun2.l.google.com', port: 19302 },
  { host: 'stun.cloudflare.com', port: 3478 },
];

export class NatTraversal {
  private localCandidates: StunCandidate[] = [];

  async gatherCandidates(): Promise<StunCandidate[]> {
    this.localCandidates = [];
    await this.gatherHostCandidates();
    await this.gatherServerReflexiveCandidates();
    return this.localCandidates;
  }

  private async gatherHostCandidates(): Promise<void> {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaces = interfaces[name] || [];
      for (const iface of ifaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          this.localCandidates.push({
            type: 'host',
            address: iface.address,
            port: 25565,
            protocol: 'udp',
          });
        }
      }
    }
  }

  private async gatherServerReflexiveCandidates(): Promise<void> {
    const promises = STUN_SERVERS.map(async (server) => {
      try {
        const publicAddr = await this.queryStun(server.host, server.port);
        if (publicAddr) {
          const exists = this.localCandidates.some(
            (c) => c.type === 'srflx' && c.address === publicAddr.address
          );
          if (!exists) {
            this.localCandidates.push({
              type: 'srflx',
              address: publicAddr.address,
              port: publicAddr.port,
              protocol: 'udp',
            });
          }
        }
      } catch {}
    });

    await Promise.allSettled(promises);
  }

  private queryStun(host: string, port: number): Promise<{ address: string; port: number } | null> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        resolve(null);
      }, 3000);

      const transactionId = Buffer.alloc(12);
      for (let i = 0; i < 12; i++) {
        transactionId[i] = Math.floor(Math.random() * 256);
      }

      const stunRequest = Buffer.alloc(20);
      stunRequest.writeUInt16BE(0x0001, 0);
      stunRequest.writeUInt16BE(0, 2);
      stunRequest.writeUInt32BE(0x2112a442, 4);
      transactionId.copy(stunRequest, 8);

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        try {
          const parsed = this.parseStunResponse(msg, transactionId);
          socket.close();
          resolve(parsed);
        } catch {
          socket.close();
          resolve(null);
        }
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      socket.send(stunRequest, 0, stunRequest.length, port, host);
    });
  }

  private parseStunResponse(
    msg: Buffer,
    transactionId: Buffer
  ): { address: string; port: number } | null {
    if (msg.length < 20) return null;

    const msgType = msg.readUInt16BE(0);
    const msgLength = msg.readUInt16BE(2);
    const msgTransactionId = msg.slice(8, 20);

    if (!msgTransactionId.equals(transactionId)) return null;

    if ((msgType & 0x0110) !== 0x0100) return null;

    const magicCookie = 0x2112a442;
    const magicCookieBytes = Buffer.alloc(4);
    magicCookieBytes.writeUInt32BE(magicCookie, 0);

    let offset = 20;
    while (offset < 20 + msgLength) {
      if (offset + 4 > msg.length) break;

      const attrType = msg.readUInt16BE(offset);
      const attrLength = msg.readUInt16BE(offset + 2);
      offset += 4;

      if (offset + attrLength > msg.length) break;

      if (attrType === 0x0001) {
        const mappedPort = msg.readUInt16BE(offset + 2);
        const mappedIp = `${msg[offset + 4]}.${msg[offset + 5]}.${msg[offset + 6]}.${msg[offset + 7]}`;
        return { address: mappedIp, port: mappedPort };
      }

      if (attrType === 0x0020) {
        const xorPort = msg.readUInt16BE(offset + 2) ^ (magicCookie >> 16);
        const ipBytes = [
          msg[offset + 4] ^ magicCookieBytes[0],
          msg[offset + 5] ^ magicCookieBytes[1],
          msg[offset + 6] ^ magicCookieBytes[2],
          msg[offset + 7] ^ magicCookieBytes[3],
        ];
        const mappedIp = ipBytes.join('.');
        return { address: mappedIp, port: xorPort };
      }

      offset += attrLength;
      if (attrLength % 4 !== 0) {
        offset += 4 - (attrLength % 4);
      }
    }

    return null;
  }

  async testConnectivity(
    remoteAddress: string,
    remotePort: number,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    if (remotePort === 443 || remotePort === 80) {
      return this.testTcpConnectivity(remoteAddress, remotePort, timeoutMs);
    }
    if ([19302, 3478, 3479].includes(remotePort)) {
      return this.testStunConnectivity(remoteAddress, remotePort, timeoutMs);
    }
    return this.testUdpConnectivity(remoteAddress, remotePort, timeoutMs);
  }

  private testTcpConnectivity(
    remoteAddress: string,
    remotePort: number,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = net.createConnection({
        host: remoteAddress,
        port: remotePort,
        timeout: timeoutMs,
      });

      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeoutMs);

      socket.on('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private testStunConnectivity(
    host: string,
    port: number,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      this.queryStun(host, port).then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result !== null);
        }
      }).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
    });
  }

  private testUdpConnectivity(
    remoteAddress: string,
    remotePort: number,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = dgram.createSocket('udp4');
      const timer = setTimeout(() => {
        socket.close();
        resolve(false);
      }, timeoutMs);

      socket.on('message', () => {
        clearTimeout(timer);
        socket.close();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      const probe = Buffer.from('MC-PING');
      socket.send(probe, 0, probe.length, remotePort, remoteAddress);

      setTimeout(() => {
        socket.send(probe, 0, probe.length, remotePort, remoteAddress);
      }, 1000);
    });
  }

  getNatType(): 'open' | 'restricted' | 'symmetric' | 'unknown' {
    const srflx = this.localCandidates.filter((c) => c.type === 'srflx');
    if (srflx.length === 0) return 'symmetric';
    if (srflx.length === 1) return 'restricted';
    return 'open';
  }
}
