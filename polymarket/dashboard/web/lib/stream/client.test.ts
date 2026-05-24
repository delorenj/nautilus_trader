import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStreamClient } from "./client";
import type {
  StreamClient,
  StreamStatus,
  WebSocketLike,
} from "./client";
import type { StreamEvent } from "./types";

type Listener = (event: unknown) => void;
type EventType = "open" | "message" | "close" | "error";

class MockSocket implements WebSocketLike {
  readonly sent: string[] = [];
  private readonly listeners: Record<EventType, Listener[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close", { reason: "client closed" });
  }

  addEventListener(type: EventType, listener: Listener): void {
    this.listeners[type].push(listener);
  }

  open(): void {
    this.emit("open", {});
  }

  message(data: string): void {
    this.emit("message", { data });
  }

  serverClose(reason = "server closed"): void {
    this.emit("close", { reason });
  }

  private emit(type: EventType, event: unknown): void {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }
}

function makeHarness(): {
  client: StreamClient;
  events: StreamEvent[];
  parseErrors: Array<{ raw: string; error: unknown }>;
  sockets: MockSocket[];
  statuses: StreamStatus[];
} {
  const events: StreamEvent[] = [];
  const parseErrors: Array<{ raw: string; error: unknown }> = [];
  const sockets: MockSocket[] = [];
  const statuses: StreamStatus[] = [];
  let now = 1_000;

  const client = createStreamClient({
    url: "ws://stream.test",
    onEvent: (event) => events.push(event),
    onStatus: (status) => statuses.push(status),
    onParseError: (raw, error) => parseErrors.push({ raw, error }),
    wsFactory: () => {
      const socket = new MockSocket();
      sockets.push(socket);
      return socket;
    },
    now: () => now,
    randomJitter: () => 0.5,
  });

  now += 1_000;

  return { client, events, parseErrors, sockets, statuses };
}

function heartbeatEvent(t: number): StreamEvent {
  return {
    type: "heartbeat",
    t,
    data: {
      clob_ms: 1,
      data_api_ms: 2,
      signal_count: 3,
      watched_wallets: 4,
      live_trading_enabled: false,
      bridge_uptime_secs: 5,
    },
  };
}

function reconnectingStatuses(
  statuses: StreamStatus[],
): Array<Extract<StreamStatus, { phase: "reconnecting" }>> {
  return statuses.filter(
    (status): status is Extract<StreamStatus, { phase: "reconnecting" }> =>
      status.phase === "reconnecting",
  );
}

describe("createStreamClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits connecting then connected on first connect", () => {
    const { client, sockets, statuses } = makeHarness();

    sockets[0]?.open();

    expect(statuses.map((status) => status.phase)).toEqual([
      "connecting",
      "connected",
    ]);
    expect(client.status.phase).toBe("connected");
  });

  it("emits disconnected then reconnecting on unexpected close", () => {
    const { sockets, statuses } = makeHarness();

    sockets[0]?.open();
    sockets[0]?.serverClose();

    expect(statuses.map((status) => status.phase)).toEqual([
      "connecting",
      "connected",
      "disconnected",
      "reconnecting",
    ]);
    expect(reconnectingStatuses(statuses)).toEqual([
      { phase: "reconnecting", attempt: 1, nextDelayMs: 1_000 },
    ]);
  });

  it("reconnects and sends active plus queued book subscriptions", () => {
    const { client, sockets, statuses } = makeHarness();

    sockets[0]?.open();
    client.subscribeBooks(["asset-1"]);
    sockets[0]?.serverClose();
    client.subscribeBooks(["asset-2"]);

    vi.advanceTimersByTime(1_000);
    sockets[1]?.open();

    expect(statuses.map((status) => status.phase)).toEqual([
      "connecting",
      "connected",
      "disconnected",
      "reconnecting",
      "connecting",
      "connected",
    ]);
    expect(sockets[1]?.sent).toEqual([
      JSON.stringify({ type: "subscribe.books", asset_ids: ["asset-1"] }),
      JSON.stringify({ type: "subscribe.books", asset_ids: ["asset-2"] }),
    ]);
  });

  it("doubles backoff delays up to the 30s cap", () => {
    const { sockets, statuses } = makeHarness();

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      sockets.at(-1)?.serverClose();
      expect(reconnectingStatuses(statuses).at(-1)?.nextDelayMs).toBe(delay);
      vi.advanceTimersByTime(delay);
    }

    expect(reconnectingStatuses(statuses).map((status) => status.attempt)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("sends resume first after reconnect when a prior t was received", () => {
    const { client, sockets } = makeHarness();

    sockets[0]?.open();
    client.ping();
    sockets[0]?.message(JSON.stringify(heartbeatEvent(42)));
    sockets[0]?.serverClose();
    client.ping();

    vi.advanceTimersByTime(1_000);
    sockets[1]?.open();

    expect(sockets[1]?.sent).toEqual([
      JSON.stringify({ type: "resume", since_t: 42 }),
      JSON.stringify({ type: "ping" }),
    ]);
  });

  it("reports parse failures and keeps processing later events", () => {
    const { events, parseErrors, sockets } = makeHarness();

    sockets[0]?.open();
    sockets[0]?.message("{not-json");
    sockets[0]?.message(JSON.stringify(heartbeatEvent(7)));

    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0]?.raw).toBe("{not-json");
    expect(events).toEqual([heartbeatEvent(7)]);
  });

  it("close cancels pending reconnect attempts", () => {
    const { client, sockets } = makeHarness();

    sockets[0]?.open();
    sockets[0]?.serverClose();
    client.close();
    vi.advanceTimersByTime(1_000);

    expect(sockets).toHaveLength(1);
  });
});
