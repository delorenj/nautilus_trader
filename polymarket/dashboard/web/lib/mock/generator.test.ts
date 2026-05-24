import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockStream, type CreateMockStreamOptions } from "./generator";
import { StreamEvent as StreamEventSchema } from "../stream/schemas";
import type { StreamEvent } from "../stream/types";

const BASE_TIME = 1_800_000_000_000;

function scheduler(): NonNullable<CreateMockStreamOptions["scheduler"]> {
  return {
    setInterval: (cb, ms) => globalThis.setInterval(cb, ms),
    clearInterval: (handle) =>
      globalThis.clearInterval(
        handle as ReturnType<typeof globalThis.setInterval>,
      ),
    now: () => Date.now(),
  };
}

function collectEvents(
  options: Omit<CreateMockStreamOptions, "onEvent" | "scheduler">,
): {
  events: StreamEvent[];
  stream: ReturnType<typeof createMockStream>;
} {
  const events: StreamEvent[] = [];
  const stream = createMockStream({
    ...options,
    scheduler: scheduler(),
    onEvent: (event) => events.push(event),
  });

  return { events, stream };
}

function expectAllEventsToParse(events: readonly StreamEvent[]): void {
  for (const event of events) {
    expect(StreamEventSchema.parse(event)).toEqual(event);
  }
}

describe("createMockStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits whale trades at the configured cadence", () => {
    const { events, stream } = collectEvents({
      seed: 11,
      tradeIntervalMs: 250,
      signalIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });

    stream.start();
    vi.advanceTimersByTime(249);
    expect(events.filter((event) => event.type === "trade.whale")).toHaveLength(
      0,
    );

    vi.advanceTimersByTime(1);
    expect(events.filter((event) => event.type === "trade.whale")).toHaveLength(
      1,
    );

    vi.advanceTimersByTime(500);
    expect(events.filter((event) => event.type === "trade.whale")).toHaveLength(
      3,
    );
    expectAllEventsToParse(events);
  });

  it("emits signal upserts and expires stale live signals", () => {
    const { events, stream } = collectEvents({
      seed: 7,
      tradeIntervalMs: 100,
      signalIntervalMs: 50,
      heartbeatIntervalMs: 60_000,
      maxSignalAgeSecs: 0.001,
    });

    stream.start();
    vi.advanceTimersByTime(2_000);

    expect(events.some((event) => event.type === "signal.upsert")).toBe(true);
    expect(events.some((event) => event.type === "signal.expire")).toBe(true);
    expectAllEventsToParse(events);
  });

  it("emits heartbeat payloads at the configured cadence", () => {
    const { events, stream } = collectEvents({
      seed: 23,
      walletCount: 3,
      tradeIntervalMs: 60_000,
      signalIntervalMs: 60_000,
      heartbeatIntervalMs: 1_000,
    });

    stream.start();
    vi.advanceTimersByTime(999);
    expect(events).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "heartbeat",
      t: BASE_TIME + 1_000,
      data: {
        signal_count: 0,
        watched_wallets: 3,
        live_trading_enabled: false,
        bridge_uptime_secs: 1,
      },
    });

    const heartbeat = events[0];
    expect(heartbeat?.type).toBe("heartbeat");
    if (heartbeat?.type === "heartbeat") {
      expect(heartbeat.data.clob_ms).toBeGreaterThanOrEqual(80);
      expect(heartbeat.data.clob_ms).toBeLessThanOrEqual(180);
      expect(heartbeat.data.data_api_ms).toBeGreaterThanOrEqual(200);
      expect(heartbeat.data.data_api_ms).toBeLessThanOrEqual(420);
    }
    expectAllEventsToParse(events);
  });

  it("validates every generated event variant emitted by a short simulation", () => {
    const { events, stream } = collectEvents({
      seed: 13,
      tradeIntervalMs: 100,
      signalIntervalMs: 50,
      heartbeatIntervalMs: 250,
      maxSignalAgeSecs: 0.001,
    });

    stream.start();
    vi.advanceTimersByTime(2_000);

    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(["trade.whale", "signal.upsert", "signal.expire", "heartbeat"]),
    );
    expectAllEventsToParse(events);
  });

  it("stops further events and tolerates repeated stop calls", () => {
    const { events, stream } = collectEvents({
      seed: 19,
      tradeIntervalMs: 100,
      signalIntervalMs: 100,
      heartbeatIntervalMs: 100,
    });

    stream.start();
    vi.advanceTimersByTime(300);
    const eventCount = events.length;
    expect(eventCount).toBeGreaterThan(0);

    stream.stop();
    stream.stop();
    vi.advanceTimersByTime(1_000);

    expect(events).toHaveLength(eventCount);
    expectAllEventsToParse(events);
  });

  it("produces the same event sequence for the same seed", () => {
    function firstTenEvents(): StreamEvent[] {
      vi.setSystemTime(BASE_TIME);
      const { events, stream } = collectEvents({
        seed: 101,
        tradeIntervalMs: 100,
        signalIntervalMs: 50,
        heartbeatIntervalMs: 250,
        maxSignalAgeSecs: 0.001,
      });

      stream.start();
      vi.advanceTimersByTime(1_000);
      stream.stop();
      return events.slice(0, 10);
    }

    const first = firstTenEvents();
    const second = firstTenEvents();

    expect(first.length).toBe(10);
    expect(second).toEqual(first);
    expectAllEventsToParse(first);
  });
});
