import { describe, expect, it } from "vitest";

import { buildExecutionIntentSnapshot } from "./execution-intent";
import { buildExecutionReadinessSnapshot } from "./live-readiness";
import type { AutonomySnapshot } from "./types";

function autonomy(overrides: Partial<AutonomySnapshot> = {}): AutonomySnapshot {
  return {
    source: {
      kind: "artifact",
      varDir: "/tmp/autonomy",
      loadedAt: 1,
      message: "test",
      files: {
        runtime: "/tmp/autonomy/runtime_state.json",
        cycles: "/tmp/autonomy/contract_cycles.jsonl",
        postmortems: "/tmp/autonomy/contract_postmortems.jsonl",
        lessons: "/tmp/autonomy/strategy_lessons.jsonl",
        signals: "/tmp/autonomy/signal_observations.jsonl",
        strategies: "/tmp/autonomy/strategy_hypotheses.jsonl",
      },
    },
    phase: "learn",
    cycleNumber: 4,
    statusLine: "Target-hit postmortem written back.",
    strategies: [
      {
        id: "btcusdt-momentum-continuation",
        rank: 1,
        domain: "crypto",
        title: "BTC/USDT momentum continuation",
        thesis: "Follow a clean spot impulse.",
        entryRule: "Last price up at least 18 bps with spread <= 8 bps",
        exitRule: "+55 bps target, -30 bps stop",
        constraintVector: "momentum with hard stop",
        riskBudgetUsd: 25,
        confidence: 0.72,
        status: "learned",
      },
    ],
    signal: {
      signalId: "signal-kraken-cycle-0004",
      strategyId: "btcusdt-momentum-continuation",
      symbol: "BTC/USDT",
      instrumentId: "BTC/USDT.KRAKEN",
      side: "BUY",
      createdAt: 10,
      referencePrice: 100.23,
      confidence: 0.72,
      passed: true,
      reason: "Momentum and spread satisfied selected constraints.",
      spreadBps: 3.99,
      momentumBps: 23,
      suggestedNotional: 25,
    },
    activeCycle: {
      cycleId: "kraken-cycle-0004",
      strategyId: "btcusdt-momentum-continuation",
      signalKey: "signal-kraken-cycle-0004",
      marketTitle: "Kraken Spot BTC/USDT paper position",
      outcome: "BTC/USDT momentum continuation",
      side: "BUY",
      entryPrice: 100.23,
      currentPrice: 100.8,
      targetPrice: 100.78,
      stopPrice: 99.93,
      sizeUsd: 25,
      openedAt: 10,
      closedAt: 20,
      exitPrice: 100.8,
      pnlUsd: 0.14,
      closeReason: "target",
      status: "closed",
    },
    cycleHistory: [
      {
        cycleId: "kraken-cycle-0004",
        createdAt: 20,
        status: "closed",
        marketTitle: "Kraken Spot BTC/USDT paper position",
        outcome: "BTC/USDT momentum continuation",
        side: "BUY",
        pnlUsd: 0.14,
        closeReason: "target",
        lessonAction: "reinforce_target_hit_setup",
        summary: "Preserve the setup.",
      },
      {
        cycleId: "kraken-cycle-0003",
        createdAt: 19,
        status: "closed",
        marketTitle: "Kraken Spot BTC/USDT paper position",
        outcome: "BTC/USDT momentum continuation",
        side: "BUY",
        pnlUsd: -0.13,
        closeReason: "stop",
        lessonAction: "cooldown_symbol_after_loss",
        summary: "Cool down this symbol.",
      },
      {
        cycleId: "kraken-cycle-0002",
        createdAt: 18,
        status: "no_entry",
        marketTitle: "Kraken Spot signal watch",
        outcome: "No position opened",
        side: "BUY",
        pnlUsd: 0,
        closeReason: "no_signal",
        lessonAction: "relax_one_entry_constraint",
        summary: "Relax one gate.",
      },
      {
        cycleId: "kraken-cycle-0001",
        createdAt: 17,
        status: "closed",
        marketTitle: "Kraken Spot BTC/USDT paper position",
        outcome: "BTC/USDT momentum continuation",
        side: "BUY",
        pnlUsd: 0.02,
        closeReason: "timebox",
        lessonAction: "cooldown_symbol_after_loss",
        summary: "Avoid stale exposure.",
      },
    ],
    postmortems: [
      {
        cycleId: "kraken-cycle-0004",
        createdAt: 20,
        headline: "Target exit captured the planned edge.",
        exitQuality: "good",
        findings: ["Target hit."],
        nextAdjustment: "Keep the strategy active.",
      },
    ],
    lessons: [
      {
        lessonId: "lesson-kraken-cycle-0004",
        cycleId: "kraken-cycle-0004",
        createdAt: 21,
        summary: "Re-use the entry shape.",
        appliesTo: "BTC/USDT / BUY",
        action: "reinforce_target_hit_setup",
      },
    ],
    ...overrides,
  };
}

const liveReadyEnv = {
  KRAKEN_SPOT_LIVE_ARMED: "true",
  KRAKEN_SPOT_LIVE_CONFIRM: "I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK",
  KRAKEN_SPOT_API_KEY: "super-secret-key",
  KRAKEN_SPOT_API_SECRET: "super-secret-secret",
  KRAKEN_SPOT_MAX_NOTIONAL_USD: "25",
  KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD: "100",
  KRAKEN_SPOT_SYMBOL_ALLOWLIST: "BTC/USDT,ETH/USDT",
};

describe("execution intent", () => {
  it("builds entry, exit, and reconciliation intents without enabling submission", () => {
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot(
      liveReadyEnv,
      snapshot,
      123,
    );
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    expect(intent.status).toBe("live-ready-dry-run");
    expect(intent.entry).toMatchObject({
      role: "entry",
      symbol: "BTC/USDT",
      side: "BUY",
      orderType: "MARKET",
      timeInForce: "IOC",
      quoteNotionalUsd: 25,
      clientOrderId: "ks-0004-entry",
    });
    expect(intent.exits.map((exit) => exit.role)).toEqual([
      "take_profit",
      "stop_loss",
      "timebox_exit",
    ]);
    expect(intent.exits[0]).toMatchObject({
      side: "SELL",
      orderType: "LIMIT",
      limitPrice: 100.78,
    });
    expect(intent.reconciliation.status).toBe("paper_reconciled");
    expect(intent.submission).toMatchObject({
      enabled: false,
      mode: "live-ready",
    });
  });

  it("shows a paper-ready ticket when live readiness is blocked", () => {
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot({}, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    expect(intent.status).toBe("paper-ready");
    expect(intent.entry?.quoteNotionalUsd).toBe(25);
    expect(intent.submission.blockedBy).toContain("Execution gate");
    expect(intent.submission.blockedBy).toContain("Kraken Spot credentials");
  });

  it("blocks ticket creation when the latest signal failed", () => {
    const snapshot = autonomy({
      signal: {
        ...autonomy().signal!,
        passed: false,
        reason: "No entry: impulse or spread did not clear the selected constraints.",
      },
      activeCycle: null,
    });
    const readiness = buildExecutionReadinessSnapshot({}, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    expect(intent.status).toBe("blocked");
    expect(intent.entry).toBeNull();
    expect(intent.exits).toEqual([]);
    expect(intent.checks).toContainEqual(
      expect.objectContaining({
        id: "signal",
        status: "fail",
      }),
    );
  });

  it("does not expose credential values", () => {
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot(
      liveReadyEnv,
      snapshot,
      123,
    );
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);
    const serialized = JSON.stringify(intent);

    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("super-secret-secret");
  });
});
