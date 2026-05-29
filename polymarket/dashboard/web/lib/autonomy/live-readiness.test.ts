import { describe, expect, it } from "vitest";

import type { AutonomySnapshot } from "./types";
import { buildExecutionReadinessSnapshot } from "./live-readiness";

const autonomy = {
  cycleHistory: [
    {
      cycleId: "kraken-cycle-0004",
      createdAt: 4,
      status: "closed",
      marketTitle: "Kraken Spot BTC/USDT paper position",
      outcome: "BTC/USDT momentum continuation",
      side: "BUY",
      pnlUsd: 0.02,
      closeReason: "timebox",
      lessonAction: "cooldown_symbol_after_loss",
      summary: "Avoid stale exposure.",
    },
    {
      cycleId: "kraken-cycle-0003",
      createdAt: 3,
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
      createdAt: 2,
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
      createdAt: 1,
      status: "closed",
      marketTitle: "Kraken Spot BTC/USDT paper position",
      outcome: "BTC/USDT momentum continuation",
      side: "BUY",
      pnlUsd: 0.14,
      closeReason: "target",
      lessonAction: "reinforce_target_hit_setup",
      summary: "Preserve the setup.",
    },
  ],
  lessons: [
    {
      lessonId: "lesson-kraken-cycle-0004",
      cycleId: "kraken-cycle-0004",
      createdAt: 5,
      summary: "Avoid stale exposure.",
      appliesTo: "Kraken Spot BTC/USDT paper position / BUY",
      action: "cooldown_symbol_after_loss",
    },
  ],
} satisfies Pick<AutonomySnapshot, "cycleHistory" | "lessons">;

describe("execution readiness", () => {
  it("keeps live blocked when required arming gates are absent", () => {
    const snapshot = buildExecutionReadinessSnapshot({}, autonomy, 123);

    expect(snapshot.executionMode).toBe("paper");
    expect(snapshot.liveBlocked).toBe(true);
    expect(snapshot.credentials).toEqual({
      apiKeyPresent: false,
      apiSecretPresent: false,
    });
    expect(snapshot.checks.filter((check) => check.status === "fail")).not.toEqual(
      [],
    );
  });

  it("reports live-ready when all explicit operator gates pass", () => {
    const snapshot = buildExecutionReadinessSnapshot(
      {
        KRAKEN_SPOT_LIVE_ARMED: "true",
        KRAKEN_SPOT_LIVE_CONFIRM: "I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK",
        KRAKEN_SPOT_API_KEY: "key",
        KRAKEN_SPOT_API_SECRET: "secret",
        KRAKEN_SPOT_MAX_NOTIONAL_USD: "25",
        KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD: "100",
        KRAKEN_SPOT_SYMBOL_ALLOWLIST: "BTC/USDT, ETH/USDT",
      },
      autonomy,
      123,
    );

    expect(snapshot.executionMode).toBe("live-ready");
    expect(snapshot.liveBlocked).toBe(false);
    expect(snapshot.risk.symbolAllowlist).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(snapshot.evidence).toMatchObject({
      cycleCount: 4,
      latestCycleId: "kraken-cycle-0004",
      latestLessonAction: "cooldown_symbol_after_loss",
    });
    expect(snapshot.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("adds a stricter go-live acceptance checklist", () => {
    const snapshot = buildExecutionReadinessSnapshot(
      {
        KRAKEN_SPOT_LIVE_ARMED: "true",
        KRAKEN_SPOT_LIVE_CONFIRM: "I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK",
        KRAKEN_SPOT_API_KEY: "key",
        KRAKEN_SPOT_API_SECRET: "secret",
        KRAKEN_SPOT_MAX_NOTIONAL_USD: "5",
        KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD: "25",
        KRAKEN_SPOT_SYMBOL_ALLOWLIST: "BTC/USDT, ETH/USDT",
        KRAKEN_SPOT_MIN_PAPER_CYCLES: "4",
        KRAKEN_SPOT_MAX_DAILY_ORDERS: "3",
        KRAKEN_SPOT_MAX_OPEN_ORDERS: "2",
        KRAKEN_SPOT_MAX_SLIPPAGE_BPS: "25",
        KRAKEN_SPOT_PAPER_REVIEW_APPROVED: "true",
        KRAKEN_SPOT_PREFLIGHT_PERMISSIONS_OK: "true",
        KRAKEN_SPOT_PREFLIGHT_BALANCES_OK: "true",
        KRAKEN_SPOT_PREFLIGHT_ASSET_PAIRS_OK: "true",
        KRAKEN_SPOT_PREFLIGHT_COST_MINIMUMS_OK: "true",
        KRAKEN_SPOT_PREFLIGHT_RATE_LIMITS_OK: "true",
        KRAKEN_SPOT_LIVE_MONITORING_OK: "true",
        KRAKEN_SPOT_LIVE_ROLLBACK_DRILLED: "true",
        KRAKEN_SPOT_CANARY_REVIEW_APPROVED: "true",
      },
      autonomy,
      123,
    );

    const items = snapshot.acceptance.groups.flatMap((group) => group.items);

    expect(snapshot.acceptance.groups.map((group) => group.id)).toEqual([
      "operator-controls",
      "strategy-evidence",
      "exchange-preflight",
      "execution-safety",
      "operations-ramp",
    ]);
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "branch-coverage",
        status: "pass",
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({
        id: "live-submitter",
        status: "fail",
      }),
    );
    expect(snapshot.acceptance.summary.blockingItems).toBeGreaterThan(0);
    expect(snapshot.acceptance.summary.statusLabel).toContain(
      "Go-live remains blocked",
    );
  });

  it("does not expose credential values in check details", () => {
    const snapshot = buildExecutionReadinessSnapshot(
      {
        KRAKEN_SPOT_API_KEY: "super-secret-key",
        KRAKEN_SPOT_API_SECRET: "super-secret-secret",
      },
      autonomy,
      123,
    );

    const details = snapshot.checks.map((check) => check.detail).join("\n");
    const acceptance = JSON.stringify(snapshot.acceptance);

    expect(details).not.toContain("super-secret-key");
    expect(details).not.toContain("super-secret-secret");
    expect(acceptance).not.toContain("super-secret-key");
    expect(acceptance).not.toContain("super-secret-secret");
  });
});
