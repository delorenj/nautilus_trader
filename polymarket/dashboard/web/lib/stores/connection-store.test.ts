import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Heartbeat } from "../stream/types";
import {
  type ConnectionInfo,
  type ConnectionName,
  selectLatencyTier,
  useConnectionStore,
} from "./connection-store";

const connection = (
  status: ConnectionInfo["status"],
  latencyMs: number | null,
): ConnectionInfo => ({
  status,
  latencyMs,
  lastUpdatedAt: 0,
});

const heartbeat: Heartbeat = {
  clob_ms: 10,
  data_api_ms: 20,
  signal_count: 3,
  watched_wallets: 4,
  live_trading_enabled: true,
  bridge_uptime_secs: 5,
};

describe("connection-store", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useConnectionStore.setState({
      connections: {
        "clob-ws": connection("disconnected", null),
        "data-api": connection("disconnected", null),
        "bot-bus": connection("disconnected", null),
      },
      heartbeat: null,
    });
  });

  it("sets status and heartbeat", () => {
    vi.setSystemTime(1_234);

    useConnectionStore.getState().setStatus("clob-ws", "connected", 80);
    useConnectionStore.getState().setHeartbeat(heartbeat);

    expect(useConnectionStore.getState().connections["clob-ws"]).toEqual({
      status: "connected",
      latencyMs: 80,
      lastUpdatedAt: 1_234,
    });
    expect(useConnectionStore.getState().heartbeat).toEqual(heartbeat);
  });

  it.each([
    ["connected", 100, "ok"],
    ["connected", 101, "warn"],
    ["connected", 500, "warn"],
    ["connected", 501, "bad"],
    ["connected", null, "unknown"],
    ["reconnecting", null, "warn"],
    ["disconnected", null, "bad"],
  ] as const)("maps %s latency %s to %s", (status, latencyMs, expected) => {
    const name: ConnectionName = "data-api";

    useConnectionStore.setState({
      connections: {
        ...useConnectionStore.getState().connections,
        [name]: connection(status, latencyMs),
      },
    });

    expect(selectLatencyTier(name)(useConnectionStore.getState())).toBe(expected);
  });
});
