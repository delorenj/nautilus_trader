import "./_init";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { Heartbeat } from "../stream/types";

export type ConnectionName = "clob-ws" | "data-api" | "bot-bus";

export interface ConnectionInfo {
  status: "connected" | "reconnecting" | "disconnected";
  latencyMs: number | null;
  lastUpdatedAt: number;
}

export interface ConnectionState {
  connections: Record<ConnectionName, ConnectionInfo>;
  heartbeat: Heartbeat | null;
  setStatus(
    name: ConnectionName,
    status: ConnectionInfo["status"],
    latencyMs: number | null,
  ): void;
  setHeartbeat(hb: Heartbeat): void;
}

export type LatencyTier = "ok" | "warn" | "bad" | "unknown";

const createInitialConnections = (): Record<ConnectionName, ConnectionInfo> => ({
  "clob-ws": {
    status: "disconnected",
    latencyMs: null,
    lastUpdatedAt: 0,
  },
  "data-api": {
    status: "disconnected",
    latencyMs: null,
    lastUpdatedAt: 0,
  },
  "bot-bus": {
    status: "disconnected",
    latencyMs: null,
    lastUpdatedAt: 0,
  },
});

export const useConnectionStore = create<ConnectionState>()(
  immer((set) => ({
    connections: createInitialConnections(),
    heartbeat: null,
    setStatus: (name, status, latencyMs) => {
      set((state) => {
        state.connections[name] = {
          status,
          latencyMs,
          lastUpdatedAt: Date.now(),
        };
      });
    },
    setHeartbeat: (hb) => {
      set((state) => {
        state.heartbeat = hb;
      });
    },
  })),
);

export const selectLatencyTier =
  (name: ConnectionName) =>
  (state: ConnectionState): LatencyTier => {
    const connection = state.connections[name];

    if (connection === undefined) {
      return "unknown";
    }

    if (connection.status === "reconnecting") {
      return "warn";
    }

    if (connection.status === "disconnected") {
      return "bad";
    }

    if (connection.latencyMs === null) {
      return "unknown";
    }

    if (connection.latencyMs <= 100) {
      return "ok";
    }

    if (connection.latencyMs <= 500) {
      return "warn";
    }

    return "bad";
  };

export const useLatencyTier = (name: ConnectionName) =>
  useConnectionStore(selectLatencyTier(name));
