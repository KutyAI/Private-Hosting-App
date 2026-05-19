import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { getDatabase } from './database';
import { rateLimiter } from './rate-limiter';
import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import friendRoutes from './routes/friends';
import presenceRoutes from './routes/presence';
import sessionRoutes from './routes/sessions';

const app = express();
const PORT = parseInt(process.env.API_PORT || '3001');

let isReady = false;
let db: any = null;

app.use(cors());
app.use(express.json());
app.use(rateLimiter);

app.use((req, res, next) => {
  (req as any).db = getDatabase();
  next();
});

app.use('/auth', authRoutes);
app.use('/devices', deviceRoutes);
app.use('/friends', friendRoutes);
app.use('/presence', presenceRoutes);
app.use('/sessions', sessionRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  if (!isReady) {
    return res.status(503).json({ status: 'starting', message: 'Service not ready' });
  }
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ready', database: 'connected' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  console.log('WebSocket client connected');

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      ws.send(JSON.stringify({ type: 'ack', message: 'Received' }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
  db = getDatabase();
  isReady = true;
  console.log('Backend ready and accepting connections');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  isReady = false;
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
});
