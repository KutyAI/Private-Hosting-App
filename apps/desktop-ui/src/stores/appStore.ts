import { create } from 'zustand';
import type { LocalServer, ServerMetrics, LogEntry, BackupRecord } from '@mc-host/shared-types';

interface AppState {
  isOnboarded: boolean;
  servers: LocalServer[];
  selectedServer: string | null;
  metrics: Record<string, ServerMetrics>;
  logs: Record<string, LogEntry[]>;
  isConnected: boolean;
  setOnboarded: (v: boolean) => void;
  setServers: (servers: LocalServer[]) => void;
  addServer: (server: LocalServer) => void;
  setSelectedServer: (id: string | null) => void;
  updateMetrics: (serverId: string, metrics: ServerMetrics) => void;
  addLog: (serverId: string, log: LogEntry) => void;
  setConnected: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isOnboarded: false,
  servers: [],
  selectedServer: null,
  metrics: {},
  logs: {},
  isConnected: false,
  setOnboarded: (v) => set({ isOnboarded: v }),
  setServers: (servers) => set({ servers }),
  addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),
  setSelectedServer: (id) => set({ selectedServer: id }),
  updateMetrics: (serverId, metrics) =>
    set((state) => ({
      metrics: { ...state.metrics, [serverId]: metrics },
    })),
  addLog: (serverId, log) =>
    set((state) => {
      const existing = state.logs[serverId] || [];
      return {
        logs: { ...state.logs, [serverId]: [...existing.slice(-999), log] },
      };
    }),
  setConnected: (v) => set({ isConnected: v }),
}));
