import * as net from 'net';
import { EventEmitter } from 'events';

export interface ConnectionProxyConfig {
  serverId: string;
  minecraftHost: string;
  minecraftPort: number;
  localProxyPort: number;
}

export interface ActiveConnection {
  id: string;
  deviceId: string;
  localSocket: net.Socket;
  minecraftSocket: net.Socket | null;
  bytesIn: number;
  bytesOut: number;
  connectedAt: number;
}

export class ConnectionProxy extends EventEmitter {
  private config: ConnectionProxyConfig;
  private server: net.Server | null = null;
  private connections: Map<string, ActiveConnection> = new Map();
  private connectionIdCounter = 0;

  constructor(config: ConnectionProxyConfig) {
    super();
    this.config = config;
  }

  start(): void {
    this.server = net.createServer((localSocket) => {
      const connectionId = `conn-${++this.connectionIdCounter}`;
      this.handleIncomingConnection(connectionId, localSocket);
    });

    this.server.listen(this.config.localProxyPort, '127.0.0.1', () => {
      console.log(`Connection proxy started for server ${this.config.serverId} on port ${this.config.localProxyPort}`);
      this.emit('started', {
        serverId: this.config.serverId,
        port: this.config.localProxyPort,
      });
    });

    this.server.on('error', (err) => {
      console.error(`Connection proxy error for server ${this.config.serverId}:`, err.message);
      this.emit('error', err);
    });
  }

  stop(): void {
    for (const conn of this.connections.values()) {
      this.closeConnection(conn.id);
    }
    this.connections.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleIncomingConnection(connectionId: string, localSocket: net.Socket): void {
    const pendingData: Buffer[] = [];

    localSocket.on('data', (data) => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.bytesIn += data.length;
      }
      if (conn?.minecraftSocket && conn.minecraftSocket.writable) {
        conn.minecraftSocket.write(data);
      } else {
        pendingData.push(data);
      }
    });

    localSocket.on('error', (err) => {
      console.error(`Proxy connection ${connectionId} error:`, err.message);
      this.emit('connectionError', connectionId, err);
    });

    localSocket.on('close', () => {
      this.closeConnection(connectionId);
    });

    this.connectToMinecraft(connectionId, localSocket, pendingData);
  }

  private connectToMinecraft(connectionId: string, localSocket: net.Socket, pendingData: Buffer[]): void {
    const conn: ActiveConnection = {
      id: connectionId,
      deviceId: '',
      localSocket,
      minecraftSocket: null,
      bytesIn: 0,
      bytesOut: 0,
      connectedAt: Date.now(),
    };

    this.connections.set(connectionId, conn);
    this.emit('connection', conn);

    const minecraftSocket = net.createConnection({
      host: this.config.minecraftHost,
      port: this.config.minecraftPort,
    });

    conn.minecraftSocket = minecraftSocket;

    minecraftSocket.on('connect', () => {
      if (pendingData.length > 0) {
        for (const data of pendingData) {
          minecraftSocket.write(data);
        }
        pendingData.length = 0;
      }
    });

    minecraftSocket.on('data', (data) => {
      conn.bytesOut += data.length;
      if (conn.localSocket.writable) {
        conn.localSocket.write(data);
      }
    });

    minecraftSocket.on('error', (err) => {
      console.error(`Minecraft socket error for connection ${connectionId}:`, err.message);
      this.emit('minecraftError', connectionId, err);
      conn.localSocket.end();
    });

    minecraftSocket.on('close', () => {
      this.closeConnection(connectionId);
    });
  }

  closeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    try {
      conn.localSocket.end();
    } catch {}
    try {
      conn.minecraftSocket?.end();
    } catch {}

    this.connections.delete(connectionId);
    this.emit('disconnected', connectionId, {
      bytesIn: conn.bytesIn,
      bytesOut: conn.bytesOut,
      duration: Date.now() - conn.connectedAt,
    });
  }

  getActiveConnections(): ActiveConnection[] {
    return Array.from(this.connections.values()).map(conn => ({
      ...conn,
      localSocket: null as any,
      minecraftSocket: null as any,
    }));
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
