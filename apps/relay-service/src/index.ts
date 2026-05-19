import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';

interface RelaySession {
  id: string;
  hostWs: WebSocket | null;
  guestWs: WebSocket | null;
  createdAt: number;
  bytesIn: number;
  bytesOut: number;
  active: boolean;
}

export class RelayServer {
  private wss: WebSocketServer | null = null;
  private sessions: Map<string, RelaySession> = new Map();
  private maxSessions: number;
  private port: number;

  constructor(port: number = 8443, maxSessions: number = 1000) {
    this.port = port;
    this.maxSessions = maxSessions;
  }

  start(): void {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          sessions: this.sessions.size,
          maxSessions: this.maxSessions,
        }));
        return;
      }
      if (req.url === '/stats') {
        const stats = this.getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://localhost:${this.port}`);
      const pathParts = url.pathname.split('/');
      const token = url.searchParams.get('token');

      if (pathParts[1] === 'relay' && pathParts[2]) {
        if (token && token.length < 10) {
          ws.close(1008, 'Invalid token');
          return;
        }
        this.handleRelayConnection(ws, pathParts[2], url.searchParams.get('role'));
      } else {
        ws.close(1008, 'Invalid path');
      }
    });

    this.wss.on('error', (err) => {
      console.error('Relay server error:', err);
    });

    server.listen(this.port, () => {
      console.log(`Relay server listening on port ${this.port}`);
    });
  }

  private handleRelayConnection(ws: WebSocket, sessionId: string, role: string | null): void {
    if (this.sessions.size >= this.maxSessions) {
      ws.close(1013, 'Server at capacity');
      return;
    }

    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        hostWs: null,
        guestWs: null,
        createdAt: Date.now(),
        bytesIn: 0,
        bytesOut: 0,
        active: false,
      };
      this.sessions.set(sessionId, session);
    }

    if (role === 'host') {
      if (session.hostWs) {
        ws.close(1000, 'Host already connected');
        return;
      }
      session.hostWs = ws;
      console.log(`Host connected to session ${sessionId}`);
    } else {
      if (session.guestWs) {
        ws.close(1000, 'Guest already connected');
        return;
      }
      session.guestWs = ws;
      console.log(`Guest connected to session ${sessionId}`);
    }

    ws.on('message', (data) => {
      const byteLength = Buffer.isBuffer(data) ? data.length : (data as ArrayBuffer).byteLength;
      const isHost = ws === session.hostWs;
      const target = isHost ? session.guestWs : session.hostWs;

      if (target && target.readyState === WebSocket.OPEN) {
        try {
          target.send(data);
          if (isHost) {
            session.bytesOut += byteLength;
          } else {
            session.bytesIn += byteLength;
          }
        } catch {}
      }
    });

    ws.on('close', () => {
      if (ws === session.hostWs) {
        session.hostWs = null;
      } else {
        session.guestWs = null;
      }

      if (!session.hostWs && !session.guestWs) {
        this.sessions.delete(sessionId);
        console.log(`Session ${sessionId} closed`);
      } else {
        const other = ws === session.hostWs ? session.guestWs : session.hostWs;
        if (other && other.readyState === WebSocket.OPEN) {
          other.close(1000, 'Peer disconnected');
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error in session ${sessionId}:`, err);
    });

    if (session.hostWs && session.guestWs) {
      session.active = true;
      console.log(`Session ${sessionId} fully connected`);
    }
  }

  getStats() {
    const sessions = Array.from(this.sessions.values());
    const active = sessions.filter((s) => s.active).length;
    const totalBytesIn = sessions.reduce((sum, s) => sum + s.bytesIn, 0);
    const totalBytesOut = sessions.reduce((sum, s) => sum + s.bytesOut, 0);

    return {
      totalSessions: sessions.length,
      activeSessions: active,
      maxSessions: this.maxSessions,
      totalBytesIn,
      totalBytesOut,
      uptime: Date.now() - (sessions[0]?.createdAt || Date.now()),
    };
  }

  stop(): void {
    if (this.wss) {
      for (const session of this.sessions.values()) {
        session.hostWs?.close(1001, 'Server shutting down');
        session.guestWs?.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.sessions.clear();
    }
  }
}
