import { describe, expect, it } from "vitest";

import { buildOperatorFlowSnapshot } from "./operator-flow";
import type { ExecutionSubmitState } from "./execution-submit";
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
    strategyDecision: {
      cycleId: "kraken-cycle-0004",
      createdAt: 9,
      selectedStrategyId: "btcusdt-momentum-continuation",
      selectedRank: 1,
      domain: "crypto",
      symbol: "BTC/USDT",
      hypothesesCount: 5,
      lessonsConsideredCount: 1,
      lessonsConsidered: ["Re-use the entry shape."],
      lessonInfluences: [
        "Target-hit lesson nudged the momentum setup higher without increasing size.",
      ],
      selectedReason:
        "Picked BTC/USDT momentum continuation because the target-hit lesson reinforced the setup.",
      scoring: [
        {
          strategyId: "btcusdt-momentum-continuation",
          rank: 1,
          title: "BTC/USDT momentum continuation",
          score: 72,
          confidence: 0.72,
          riskBudgetUsd: 25,
          constraintVector: "momentum with hard stop",
          lessonAdjustment: "target-hit reinforcement",
          rationale: "momentum with hard stop; confidence 0.72.",
          vectorScores: [
            {
              id: "signal_quality",
              label: "Signal quality",
              score: 72,
              rationale: "Confidence is 0.72.",
            },
            {
              id: "spread_discipline",
              label: "Spread discipline",
              score: 84,
              rationale: "Entry gate keeps spread bounded.",
            },
          ],
        },
      ],
    },
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

function execution(): ExecutionSubmitState {
  return {
    attempt: {
      eventType: "kraken_spot.execution_attempt.v1",
      attemptId: "exec-kraken-cycle-0004-123",
      createdAt: 123,
      mode: "dry-run",
      status: "DRY_RUN_RECORDED",
      statusLabel: "Dry-run execution ticket recorded.",
      cycleId: "kraken-cycle-0004",
      signalId: "signal-kraken-cycle-0004",
      entry: null,
      exits: [],
      liveGate: "paper",
      executorArmed: false,
      executorConfirmed: false,
      submitted: false,
      blockedBy: [],
      liveCommand: null,
    },
    reconciliation: {
      eventType: "kraken_spot.execution_reconciliation.v1",
      attemptId: "exec-kraken-cycle-0004-123",
      createdAt: 123,
      status: "dry_run_reconciled",
      cycleId: "kraken-cycle-0004",
      closeReason: "target",
      readyForPostmortem: true,
      krakenOrderId: null,
      clientOrderId: "ks-0004-entry",
      submittedAt: null,
      acceptedAt: null,
      filledQuantity: null,
      averageFillPrice: null,
      feeAmount: null,
      feeCurrency: null,
      slippageBps: null,
      realizedPnlUsd: 0.14,
      entryFill: {
        role: "entry",
        clientOrderId: "ks-0004-entry",
        krakenOrderId: null,
        submittedAt: null,
        acceptedAt: null,
        filledAt: 123,
        symbol: "BTC/USDT",
        side: "BUY",
        filledQuantity: 0.24942632,
        averageFillPrice: 100.23,
        notionalUsd: 25,
        feeAmount: 0,
        feeCurrency: "USDT",
        slippageBps: 0,
        realizedPnlUsd: null,
        source: "paper",
      },
      exitFill: {
        role: "take_profit",
        clientOrderId: "ks-0004-tp",
        krakenOrderId: null,
        submittedAt: null,
        acceptedAt: null,
        filledAt: 123,
        symbol: "BTC/USDT",
        side: "SELL",
        filledQuantity: 0.24942632,
        averageFillPrice: 100.8,
        notionalUsd: 25.14,
        feeAmount: 0,
        feeCurrency: "USDT",
        slippageBps: 0,
        realizedPnlUsd: 0.14,
        source: "paper",
      },
      fills: [],
      notes: [],
    },
  };
}

describe("operator flow", () => {
  it("builds the five-step product story for a completed cycle", () => {
    const flow = buildOperatorFlowSnapshot(autonomy(), 123);

    expect(flow.generatedAt).toBe(123);
    expect(flow.cycleId).toBe("kraken-cycle-0004");
    expect(flow.repeatReady).toBe(true);
    expect(flow.steps.map((step) => step.id)).toEqual([
      "ideate",
      "read_signal",
      "manage_position",
      "postmortem",
      "learn",
    ]);
    expect(flow.strategySlate).toEqual([
      expect.objectContaining({
        id: "btcusdt-momentum-continuation",
        rank: 1,
        selected: true,
        title: "BTC/USDT momentum continuation",
        vectorScores: expect.arrayContaining([
          expect.objectContaining({
            id: "signal_quality",
            score: 72,
          }),
        ]),
      }),
    ]);
    expect(flow.steps[0]).toMatchObject({
      label: "Ideate",
      state: "complete",
      headline: "5 hypotheses ranked",
      detail:
        "Picked BTC/USDT momentum continuation because the target-hit lesson reinforced the setup.",
    });
    expect(flow.steps[2]).toMatchObject({
      label: "Manage position",
      state: "complete",
      headline: "Exited by target",
    });
    expect(flow.steps[4]).toMatchObject({
      label: "Learn",
      state: "active",
      headline: "Lesson written back",
    });
  });

  it("puts strategy rationale and lesson influence into the ideate step", () => {
    const flow = buildOperatorFlowSnapshot(autonomy(), 123);
    const ideate = flow.steps[0]!;

    expect(ideate.evidence[0]).toContain("Why now:");
    expect(ideate.evidence).toContain(
      "Target-hit lesson nudged the momentum setup higher without increasing size.",
    );
    expect(ideate.evidence).toContain(
      "Vectors: Signal quality 72.0; Spread discipline 84.0.",
    );
    expect(ideate.metrics).toContainEqual({
      label: "lessons",
      value: "1",
      tone: "positive",
    });
  });

  it("surfaces reconciled execution fills in the manage-position step", () => {
    const flow = buildOperatorFlowSnapshot(
      { ...autonomy(), execution: execution() },
      123,
    );
    const manage = flow.steps[2]!;

    expect(manage.evidence).toContain(
      "Execution dry-run reconciled 2 fill legs for postmortem handoff.",
    );
    expect(manage.evidence.join("\n")).toContain("Entry fill 0.24942632");
    expect(manage.metrics).toContainEqual({
      label: "recon",
      value: "ready",
      tone: "positive",
    });
  });

  it("uses the session runbook as the learn-phase continuity summary", () => {
    const flow = buildOperatorFlowSnapshot(
      autonomy({
        sessionRunbook: {
          sessionId: "kraken-session-test",
          startedAt: 1,
          completedAt: 2,
          status: "completed",
          cycleCount: 4,
          scenarioSequence: ["target", "no-entry", "stop", "timebox"],
          cycleIds: [
            "kraken-cycle-0001",
            "kraken-cycle-0002",
            "kraken-cycle-0003",
            "kraken-cycle-0004",
          ],
          aggregatePnlUsd: 0.03,
          wins: 1,
          losses: 1,
          noEntries: 1,
          latestLessonAction: "cooldown_symbol_after_loss",
          nextCycleScenario: "no-entry",
          nextCycleRecommendation:
            "Cool down same-symbol re-entry and require stronger momentum before another buy.",
          operatorSummary:
            "Completed 4 Kraken Spot paper cycles with mixed evidence.",
          cycleTrace: [
            {
              cycleId: "kraken-cycle-0004",
              scenario: "timebox",
              result: "win",
              closeReason: "timebox",
              pnlUsd: 0.03,
              lessonAction: "cooldown_symbol_after_loss",
              nextAdjustment: "Avoid stale exposure.",
            },
          ],
        },
      }),
      123,
    );

    expect(flow.summary).toBe(
      "Completed 4 Kraken Spot paper cycles with mixed evidence.",
    );
    expect(flow.nextOperatorAction).toBe(
      "Cool down same-symbol re-entry and require stronger momentum before another buy.",
    );
    expect(flow.steps[4]?.evidence).toContain("Next rehearsal: no-entry.");
    expect(flow.steps[4]?.metrics).toContainEqual({
      label: "session",
      value: "4 cycles",
      tone: "positive",
    });
  });

  it("marks the manage-position step as skipped for a no-entry cycle", () => {
    const flow = buildOperatorFlowSnapshot(
      autonomy({
        signal: {
          ...autonomy().signal!,
          passed: false,
          reason: "No entry: impulse or spread did not clear the selected constraints.",
        },
        activeCycle: null,
        cycleHistory: [
          {
            ...autonomy().cycleHistory[0]!,
            status: "no_entry",
            closeReason: "no_signal",
            pnlUsd: 0,
          },
        ],
        postmortems: [
          {
            ...autonomy().postmortems[0]!,
            headline: "Latest artifact postmortem preserved capital with no entry.",
            exitQuality: "neutral",
          },
        ],
      }),
    );

    expect(flow.summary).toContain("No-entry branch");
    expect(flow.steps[1]).toMatchObject({
      state: "complete",
      headline: "Signal failed; no entry",
    });
    expect(flow.steps[2]).toMatchObject({
      state: "blocked",
      headline: "Position skipped",
    });
  });
});
