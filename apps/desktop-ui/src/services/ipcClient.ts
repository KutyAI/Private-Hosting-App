import type { IPCRequest } from '@mc-host/shared-types';

const IPC_URL = 'ws://127.0.0.1:9876';
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const PING_INTERVAL = 15000;

let ws: WebSocket | null = null;
let messageId = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let onStateChange: ((connected: boolean) => void) | null = null;
let onMessageCallback: ((data: any) => void) | null = null;

export function setConnectionStateHandler(handler: (connected: boolean) => void): void {
  onStateChange = handler;
}

export function connectIPC(onMessage?: (data: any) => void): Promise<void> {
  onMessageCallback = onMessage || null;
  return doConnect();
}

function doConnect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(IPC_URL);

    ws.onopen = () => {
      reconnectAttempts = 0;
      startPing();
      onStateChange?.(true);
      resolve();
    };

    ws.onerror = () => {
      reject(new Error('Failed to connect to agent'));
    };

    ws.onclose = () => {
      stopPing();
      onStateChange?.(false);
      rejectAllPending('Connection lost');
      scheduleReconnect();
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;

      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'log' && onMessageCallback) {
          onMessageCallback(data);
          return;
        }
        const req = pending.get(data.id);
        if (req) {
          pending.delete(data.id);
          if (data.success) {
            req.resolve(data.data);
          } else {
            req.reject(new Error(data.error || 'Unknown error'));
          }
        }
      } catch {}
    };
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    doConnect().catch(() => {});
  }, delay);
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    }
  }, PING_INTERVAL);
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function rejectAllPending(reason: string): void {
  for (const [, req] of pending) {
    req.reject(new Error(reason));
  }
  pending.clear();
}

export function sendIPCCommand<T = any>(command: string, params?: Record<string, unknown>): Promise<T> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Not connected to agent'));
  }

  const id = `req_${++messageId}`;
  const request: IPCRequest = { id, command: command as any, params };

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws!.send(JSON.stringify(request));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Command timed out'));
      }
    }, 30000);
  });
}

export function disconnectIPC(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopPing();
  reconnectAttempts = 0;
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  onStateChange?.(false);
}
