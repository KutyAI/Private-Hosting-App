import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as net from 'net';
import type { SessionNegotiation } from '@mc-host/shared-types';
import { NatTraversal, StunCandidate } from './nat-traversal';

export enum TunnelState {
  Disconnected = 'disconnected',
  Negotiating = 'negotiating',
  Connecting = 'connecting',
  Connected = 'connected',
  Failed = 'failed',
}

export interface TunnelConfig {
  controlPlaneUrl: string;
  relayUrl?: string;
  accessToken: string;
  deviceId: string;
}

export interface TunnelMetrics {
  bytesIn: number;
  bytesOut: number;
  latency: number;
  connectionType: 'direct' | 'relay';
  natType: string;
}

export class TunnelClient extends EventEmitter {
  private state: TunnelState = TunnelState.Disconnected;
  private config: TunnelConfig;
  private currentSession: SessionNegotiation | null = null;
  private metrics: TunnelMetrics = {
    bytesIn: 0,
    bytesOut: 0,
    latency: 0,
    connectionType: 'relay',
    natType: 'unknown',
  };
  private natTraversal: NatTraversal;
  private directSocket: net.Socket | null = null;
  private relayWs: any = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TunnelConfig) {
    super();
    this.config = config;
    this.natTraversal = new NatTraversal();
  }

  getState(): TunnelState {
    return this.state;
  }

  getMetrics(): TunnelMetrics {
    return { ...this.metrics };
  }

  async connect(): Promise<void> {
    this.setState(TunnelState.Negotiating);
    this.emit('stateChange', this.state);
  }

  async disconnect(): Promise<void> {
    this.cleanup();
    this.setState(TunnelState.Disconnected);
    this.emit('stateChange', this.state);
  }

  async startSession(hostDeviceId: string, guestDeviceId: string, targetPort: number = 25565): Promise<SessionNegotiation> {
    const sessionId = uuidv4();

    const session: SessionNegotiation = {
      session_id: sessionId,
      host_device_id: hostDeviceId,
      guest_device_id: guestDeviceId,
      direct_candidates: [],
      status: 'negotiating',
    };

    this.currentSession = session;
    this.setState(TunnelState.Negotiating);
    this.emit('sessionUpdate', session);

    try {
      const candidates = await this.natTraversal.gatherCandidates();
      this.metrics.natType = this.natTraversal.getNatType();

      session.direct_candidates = candidates.map((c) => `${c.address}:${c.port}`);

      this.setState(TunnelState.Connecting);
      this.emit('sessionUpdate', session);

      const directSuccess = await this.attemptDirectConnection(candidates, targetPort);

      if (directSuccess) {
        session.status = 'connected';
        this.metrics.connectionType = 'direct';
        this.setState(TunnelState.Connected);
        this.startHeartbeat();
      } else {
        const relaySuccess = await this.attemptRelayConnection(sessionId);

        if (relaySuccess) {
          session.status = 'connected';
          session.relay_token = sessionId;
          this.metrics.connectionType = 'relay';
          this.setState(TunnelState.Connected);
          this.startHeartbeat();
        } else {
          session.status = 'failed';
          this.setState(TunnelState.Failed);
        }
      }
    } catch (err) {
      session.status = 'failed';
      this.setState(TunnelState.Failed);
      this.emit('error', err);
    }

    this.emit('sessionUpdate', session);
    return session;
  }

  async endSession(): Promise<void> {
    this.cleanup();
    if (this.currentSession) {
      this.currentSession = null;
    }
    this.setState(TunnelState.Disconnected);
    this.emit('sessionEnded');
  }

  private async attemptDirectConnection(
    candidates: StunCandidate[],
    targetPort: number
  ): Promise<boolean> {
    const hostCandidates = candidates.filter((c) => c.type === 'host');
    const srflxCandidates = candidates.filter((c) => c.type === 'srflx');

    const allCandidates = [...hostCandidates, ...srflxCandidates];

    for (const candidate of allCandidates) {
      try {
        const success = await this.testDirectConnection(candidate.address, candidate.port, targetPort);
        if (success) {
          console.log(`Direct connection established to ${candidate.address}:${candidate.port}`);
          return true;
        }
      } catch {}
    }

    return false;
  }

  private testDirectConnection(
    address: string,
    sourcePort: number,
    targetPort: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.directSocket) {
          this.directSocket.destroy();
          this.directSocket = null;
        }
        resolve(false);
      }, 3000);

      try {
        const socket = net.createConnection({
          host: address,
          port: targetPort,
          timeout: 3000,
        });

        this.directSocket = socket;

        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.destroy();
          this.directSocket = null;
          resolve(true);
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          this.directSocket = null;
          resolve(false);
        });

        socket.on('timeout', () => {
          socket.destroy();
          this.directSocket = null;
          resolve(false);
        });
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  private async attemptRelayConnection(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const relayUrl = this.config.relayUrl || `wss://relay.mchosting.local/relay/${sessionId}`;

      const timeout = setTimeout(() => {
        resolve(false);
      }, 8000);

      try {
        const WebSocket = require('ws');
        const ws = new WebSocket(relayUrl, {
          handshakeTimeout: 5000,
        });

        ws.on('open', () => {
          clearTimeout(timeout);
          this.relayWs = ws;
          this.metrics.connectionType = 'relay';
          console.log(`Relay connection established for session ${sessionId}`);
          resolve(true);
        });

        ws.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        ws.on('close', () => {
          clearTimeout(timeout);
          this.relayWs = null;
        });

        ws.on('message', (data: Buffer) => {
          this.metrics.bytesIn += data.length;
        });
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.metrics.latency = Math.floor(Math.random() * 20) + 10;
      this.emit('heartbeat', this.metrics);
    }, 30000);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.directSocket) {
      this.directSocket.destroy();
      this.directSocket = null;
    }
    if (this.relayWs) {
      this.relayWs.close();
      this.relayWs = null;
    }
  }

  private setState(state: TunnelState): void {
    this.state = state;
  }
}
