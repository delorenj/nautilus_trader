import { beforeEach, describe, expect, it } from "vitest";

import type { AutonomySnapshot } from "../autonomy/types";
import type { WhaleSignal } from "../stream/types";
import { useAutonomyStore } from "./autonomy-store";

const signal = (overrides: Partial<WhaleSignal> = {}): WhaleSignal => ({
  condition_id: "condition-a",
  asset_id: "asset-a",
  instrument_id: "instrument-a",
  side: "BUY",
  score_notional: "6200",
  suggested_notional: "12",
  reference_price: "0.5000",
  trade_count: 4,
  latest_timestamp: 1,
  wallets: ["0xaaa", "0xbbb"],
  title: "BTC/USDT spot impulse",
  slug: "btcusdt-spot-impulse",
  event_slug: "kraken-spot",
  outcome: "BTC/USDT momentum continuation",
  ...overrides,
});

describe("autonomy-store", () => {
  beforeEach(() => {
    useAutonomyStore.setState(useAutonomyStore.getInitialState(), true);
  });

  it("starts a run in the signal-reading phase", () => {
    useAutonomyStore.getState().startRun(1_000);

    expect(useAutonomyStore.getState()).toMatchObject({
      phase: "signal_watch",
      statusLine: "Scanning for a favorable Kraken Spot signal.",
      runStartedAt: 1_000,
    });
  });

  it("enters, exits, postmortems, and commits a lesson", () => {
    useAutonomyStore.getState().startRun(1_000);
    useAutonomyStore.getState().advance([signal()], 2_000);

    expect(useAutonomyStore.getState().phase).toBe("monitor_exit");
    expect(useAutonomyStore.getState().signalObservation).toMatchObject({
      passed: true,
      reason: "Signal cleared the selected strategy's entry gate.",
      momentumBps: 22.8,
    });
    expect(useAutonomyStore.getState().activeCycle).toMatchObject({
      marketTitle: "BTC/USDT spot impulse",
      status: "open",
      entryPrice: 0.5,
    });

    useAutonomyStore.getState().advance([signal()], 18_000);

    expect(useAutonomyStore.getState().phase).toBe("postmortem");
    expect(useAutonomyStore.getState().activeCycle).toMatchObject({
      status: "closed",
      closeReason: "target",
    });
    const postmortem = useAutonomyStore.getState().postmortems[0];
    expect(postmortem).toBeDefined();
    expect(postmortem?.headline).toBe(
      "Target exit captured the planned edge.",
    );

    useAutonomyStore.getState().advance([signal()], 23_000);

    expect(useAutonomyStore.getState().phase).toBe("learn");
    expect(useAutonomyStore.getState().lessons[0]).toMatchObject({
      cycleId: "cycle-001",
      summary: "Target-hit setup recorded as positive evidence.",
    });
    expect(useAutonomyStore.getState().cycleHistory[0]).toMatchObject({
      cycleId: "cycle-001",
      status: "closed",
      closeReason: "target",
    });
  });

  it("turns signal starvation into a postmortem and lesson", () => {
    useAutonomyStore.getState().startRun(1_000);
    useAutonomyStore.getState().advance([], 23_000);

    expect(useAutonomyStore.getState()).toMatchObject({
      phase: "postmortem",
      statusLine:
        "No entry recorded; postmortem is checking which constraint to loosen.",
    });
    expect(useAutonomyStore.getState().postmortems[0]).toMatchObject({
      cycleId: "cycle-001",
      headline: "No entry preserved capital because the signal gate never cleared.",
    });

    useAutonomyStore.getState().advance([], 28_000);

    expect(useAutonomyStore.getState()).toMatchObject({
      phase: "learn",
      statusLine: "No-entry postmortem converted into the next constraint change.",
    });
    expect(useAutonomyStore.getState().lessons[0]).toMatchObject({
      cycleId: "cycle-001",
      summary: "No-entry cycle recorded as a controlled constraint adjustment.",
    });
    expect(useAutonomyStore.getState().cycleHistory[0]).toMatchObject({
      status: "no_entry",
      closeReason: "no_signal",
    });
  });

  it("hydrates artifact strategy decisions for the product timeline", () => {
    const loadedAt = 1_779_653_000_000;
    const snapshot: AutonomySnapshot = {
      source: {
        kind: "artifact",
        varDir: "/tmp/kraken",
        loadedAt,
        message: "loaded",
        files: {
          runtime: "/tmp/kraken/runtime_state.json",
          cycles: "/tmp/kraken/contract_cycles.jsonl",
          postmortems: "/tmp/kraken/contract_postmortems.jsonl",
          lessons: "/tmp/kraken/strategy_lessons.jsonl",
          signals: "/tmp/kraken/signal_observations.jsonl",
          strategies: "/tmp/kraken/strategy_hypotheses.jsonl",
          decisions: "/tmp/kraken/strategy_decisions.jsonl",
        },
      },
      phase: "learn",
      cycleNumber: 31,
      statusLine: "Lesson committed.",
      strategies: [
        {
          id: "btcusdt-momentum-continuation",
          rank: 1,
          domain: "crypto",
          title: "BTC/USDT momentum continuation",
          thesis: "Follow a clean spot impulse.",
          entryRule: "Momentum clears.",
          exitRule: "Target, stop, or timebox.",
          constraintVector: "momentum with hard stop",
          riskBudgetUsd: 25,
          confidence: 0.62,
          status: "learned",
        },
      ],
      strategyDecision: {
        cycleId: "kraken-cycle-0031",
        createdAt: loadedAt,
        selectedStrategyId: "btcusdt-momentum-continuation",
        selectedRank: 1,
        domain: "crypto",
        symbol: "BTC/USDT",
        hypothesesCount: 5,
        lessonsConsideredCount: 8,
        lessonsConsidered: ["No-entry lesson kept spread discipline."],
        lessonInfluences: [
          "No-entry lesson keeps the spread gate intact and loosens only one impulse threshold.",
        ],
        selectedReason: "Selected from artifact rationale.",
        scoring: [
          {
            strategyId: "btcusdt-momentum-continuation",
            rank: 1,
            title: "BTC/USDT momentum continuation",
            score: 62,
            confidence: 0.62,
            riskBudgetUsd: 25,
            constraintVector: "momentum with hard stop",
            lessonAdjustment: "no-entry lesson",
            rationale: "risk cap 25 USD",
            vectorScores: [],
          },
        ],
      },
      signal: null,
      activeCycle: null,
      cycleHistory: [],
      sessionRunbook: null,
      postmortems: [],
      lessons: [],
    };

    useAutonomyStore.getState().hydrateFromSnapshot(snapshot);

    expect(useAutonomyStore.getState()).toMatchObject({
      artifactHydrated: true,
      strategyDecision: {
        selectedReason: "Selected from artifact rationale.",
        lessonsConsideredCount: 8,
      },
    });
  });
});
