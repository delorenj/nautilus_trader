import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildExecutionIntentSnapshot } from "./execution-intent";
import { buildExecutionReadinessSnapshot } from "./live-readiness";
import {
  readExecutionSubmitState,
  recordExecutionAttempt,
} from "./execution-submit";
import type { AutonomySnapshot } from "./types";

function autonomy(): AutonomySnapshot {
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

function jsonl(path: string) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("execution submit", () => {
  it("records a dry-run attempt and reconciliation without live submission", () => {
    const varDir = mkdtempSync(join(tmpdir(), "execution-submit-"));
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot({}, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    const result = recordExecutionAttempt({
      request: { mode: "dry-run" },
      intent,
      readiness,
      env: {},
      varDir,
      now: 789,
    });

    expect(result.ok).toBe(true);
    expect(result.attempt).toMatchObject({
      status: "DRY_RUN_RECORDED",
      submitted: false,
      mode: "dry-run",
      liveCommand: null,
    });
    expect(result.reconciliation).toMatchObject({
      status: "dry_run_reconciled",
      krakenOrderId: null,
      realizedPnlUsd: 0.14,
      closeReason: "target",
      readyForPostmortem: true,
      entryFill: {
        role: "entry",
        clientOrderId: "ks-0004-entry",
        symbol: "BTC/USDT",
        averageFillPrice: 100.23,
        source: "paper",
      },
      exitFill: {
        role: "take_profit",
        clientOrderId: "ks-0004-tp",
        averageFillPrice: 100.8,
        realizedPnlUsd: 0.14,
        source: "paper",
      },
    });
    expect(result.reconciliation.fills).toHaveLength(2);
    expect(existsSync(join(varDir, "execution_attempts.jsonl"))).toBe(true);
    expect(jsonl(join(varDir, "execution_attempts.jsonl"))[0]).toMatchObject({
      attemptId: "exec-kraken-cycle-0004-789",
    });
    expect(readExecutionSubmitState(varDir).attempt).toMatchObject({
      status: "DRY_RUN_RECORDED",
    });
  });

  it("blocks live attempts before writing any submitted state when gates fail", () => {
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot({}, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    const result = recordExecutionAttempt({
      request: { mode: "live" },
      intent,
      readiness,
      env: {},
      varDir: mkdtempSync(join(tmpdir(), "execution-submit-live-blocked-")),
      now: 789,
    });

    expect(result.ok).toBe(false);
    expect(result.attempt.status).toBe("LIVE_BLOCKED");
    expect(result.attempt.submitted).toBe(false);
    expect(result.attempt.liveCommand).toBeNull();
    expect(result.attempt.blockedBy).toContain("Execution gate");
    expect(result.attempt.blockedBy).toContain("Live executor flag");
  });

  it("records a Nautilus live command descriptor without submitting when gates pass", () => {
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot(liveReadyEnv, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    const result = recordExecutionAttempt({
      request: { mode: "live" },
      intent,
      readiness,
      env: {
        ...liveReadyEnv,
        KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED: "true",
        KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM:
          "I_ACCEPT_KRAKEN_SPOT_LIVE_ORDER_SUBMISSION",
      },
      varDir: mkdtempSync(join(tmpdir(), "execution-submit-not-implemented-")),
      now: 789,
    });

    expect(result.ok).toBe(false);
    expect(result.attempt).toMatchObject({
      status: "LIVE_COMMAND_READY",
      submitted: false,
      blockedBy: ["Live submitter implementation"],
      liveCommand: {
        schemaVersion: "kraken_spot.nautilus_live_command.v1",
        venue: "KRAKEN",
        productType: "SPOT",
        submissionAllowed: false,
        submitterImplemented: false,
        safetyBoundary: "descriptor-only",
        clientConfig: {
          adapter: "KrakenLiveExecClientFactory",
          configClass: "KrakenExecClientConfig",
          environment: "LIVE",
          productTypes: ["SPOT"],
          spotAccountType: "CASH",
          useSpotPositionReports: true,
          spotPositionsQuoteCurrency: "USDT",
          credentialSource: {
            apiKeyEnv: "KRAKEN_SPOT_API_KEY",
            apiSecretEnv: "KRAKEN_SPOT_API_SECRET",
            apiKeyPresent: true,
            apiSecretPresent: true,
            secretPolicy: "env-only-redacted",
          },
        },
        risk: {
          maxOrderNotionalUsd: 25,
          dailyLossLimitUsd: 100,
          symbolAllowlist: ["BTC/USDT", "ETH/USDT"],
        },
        entry: {
          clientOrderId: "ks-0004-entry",
          instrumentId: "BTC/USDT.KRAKEN",
          side: "BUY",
          orderType: "MARKET",
          timeInForce: "IOC",
          nautilus: {
            accountType: "CASH",
          },
        },
      },
    });
    expect(result.attempt.liveCommand?.exits.map((exit) => exit.role)).toEqual([
      "take_profit",
      "stop_loss",
      "timebox_exit",
    ]);
    expect(result.reconciliation.notes[0]).toContain("Nautilus live command");
  });

  it("does not write secret values to artifacts", () => {
    const varDir = mkdtempSync(join(tmpdir(), "execution-submit-secrets-"));
    const snapshot = autonomy();
    const readiness = buildExecutionReadinessSnapshot(liveReadyEnv, snapshot, 123);
    const intent = buildExecutionIntentSnapshot(snapshot, readiness, 456);

    recordExecutionAttempt({
      request: { mode: "live" },
      intent,
      readiness,
      env: {
        ...liveReadyEnv,
        KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED: "true",
        KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM:
          "I_ACCEPT_KRAKEN_SPOT_LIVE_ORDER_SUBMISSION",
      },
      varDir,
      now: 789,
    });

    const serialized = [
      readFileSync(join(varDir, "execution_attempts.jsonl"), "utf8"),
      readFileSync(join(varDir, "execution_reconciliations.jsonl"), "utf8"),
    ].join("\n");

    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("super-secret-secret");
  });
});
