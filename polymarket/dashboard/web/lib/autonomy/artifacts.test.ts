import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAutonomySnapshot } from "./artifacts";

function jsonl(rows: unknown[]) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

describe("autonomy artifacts", () => {
  it("maps bot cycle, postmortem, and lesson JSONL into a dashboard snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "autonomy-artifacts-"));

    writeFileSync(
      join(dir, "strategy_hypotheses.jsonl"),
      jsonl([
        {
          event_type: "kraken_spot.strategy_hypothesis.v1",
          created_ts: 99,
          id: "kraken-btc-momentum",
          rank: 1,
          domain: "crypto",
          title: "BTC/USDT momentum continuation",
          thesis: "Follow a clean Kraken Spot impulse.",
          entry_rule: "Last price up at least 18 bps",
          exit_rule: "+55 bps target, -30 bps stop",
          constraint_vector: "momentum with hard stop",
          risk_budget_usd: 25,
          confidence: 0.68,
          status: "selected",
        },
      ]),
    );
    writeFileSync(
      join(dir, "strategy_decisions.jsonl"),
      jsonl([
        {
          event_type: "kraken_spot.strategy_decision.v1",
          cycle_id: "cycle-real",
          created_ts: 99,
          selected_strategy_id: "kraken-btc-momentum",
          selected_rank: 1,
          domain: "crypto",
          symbol: "BTC/USDT",
          hypotheses_count: 1,
          lessons_considered_count: 1,
          lessons_considered: ["Keep the setup as positive evidence."],
          lesson_influences: [
            "Target-hit lesson nudged the momentum setup higher without increasing size.",
          ],
          selected_reason:
            "Picked BTC/USDT momentum continuation because the target-hit lesson reinforced it.",
          scoring: [
            {
              strategy_id: "kraken-btc-momentum",
              rank: 1,
              title: "BTC/USDT momentum continuation",
              score: 72,
              confidence: 0.72,
              risk_budget_usd: 25,
              constraint_vector: "momentum with hard stop",
              lesson_adjustment: "target-hit reinforcement",
              rationale: "momentum with hard stop; confidence 0.72.",
              vector_scores: [
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
      ]),
    );
    writeFileSync(
      join(dir, "contract_cycles.jsonl"),
      jsonl([
        {
          event_type: "kraken_spot.trade_cycle.closed.v1",
          cycle_id: "cycle-real",
          created_ts: 200,
          status: "CLOSED",
          position: {
            signal_id: "signal-real",
            token_id: "token-real",
            market_title: "Will the test cycle close?",
            outcome: "Yes",
            side: "BUY",
            entry_price: 0.42,
            exit_price: 0.45,
            target_price: 0.46,
            stop_price: 0.4,
            size_usdc: 12,
            opened_ts: 100,
            closed_ts: 200,
            pnl_usdc: 0.85,
            close_reason: "target",
            status: "CLOSED",
          },
        },
      ]),
    );
    writeFileSync(
      join(dir, "contract_postmortems.jsonl"),
      jsonl([
        {
          cycle_id: "cycle-real",
          created_ts: 201,
          result: "win",
          close_reason: "target",
          side: "BUY",
          outcome: "Yes",
          entry_price: 0.42,
          exit_price: 0.45,
          findings: ["Target was hit cleanly."],
        },
      ]),
    );
    writeFileSync(
      join(dir, "strategy_lessons.jsonl"),
      jsonl([
        {
          lesson_id: "lesson-real",
          cycle_id: "cycle-real",
          created_ts: 202,
          market_title: "Will the test cycle close?",
          side: "BUY",
          outcome: "Yes",
          action: "reinforce_target_hit_setup",
          recommendation: "Keep the setup as positive evidence.",
        },
      ]),
    );
    writeFileSync(
      join(dir, "session_runbook.json"),
      `${JSON.stringify({
        event_type: "kraken_spot.session_runbook.v1",
        session_id: "kraken-session-test",
        started_ts: 90,
        completed_ts: 205,
        status: "completed",
        cycle_count: 1,
        scenario_sequence: ["target"],
        cycle_ids: ["cycle-real"],
        aggregate_pnl_usdc: 0.85,
        wins: 1,
        losses: 0,
        no_entries: 0,
        latest_lesson_action: "reinforce_target_hit_setup",
        next_cycle_scenario: "target",
        next_cycle_recommendation:
          "Run the same target-first setup again at the same paper risk before increasing size.",
        operator_summary:
          "Completed 1 Kraken Spot paper cycle with 1 win, 0 losses, 0 no-entry branches, and 0.85 USDC aggregate paper PnL.",
        cycle_trace: [
          {
            cycle_id: "cycle-real",
            scenario: "target",
            result: "win",
            close_reason: "target",
            pnl_usdc: 0.85,
            lesson_action: "reinforce_target_hit_setup",
            next_adjustment: "Keep the setup as positive evidence.",
          },
        ],
      })}\n`,
    );

    const snapshot = buildAutonomySnapshot(dir);

    expect(snapshot.source.kind).toBe("artifact");
    expect(snapshot.phase).toBe("learn");
    expect(snapshot.activeCycle).toMatchObject({
      cycleId: "cycle-real",
      status: "closed",
      marketTitle: "Will the test cycle close?",
      closeReason: "target",
      pnlUsd: 0.85,
    });
    expect(snapshot.postmortems[0]).toMatchObject({
      cycleId: "cycle-real",
      headline: "Latest artifact postmortem found a winning cycle.",
    });
    expect(snapshot.lessons[0]).toMatchObject({
      lessonId: "lesson-real",
      action: "reinforce_target_hit_setup",
    });
    expect(snapshot.cycleHistory[0]).toMatchObject({
      cycleId: "cycle-real",
      status: "closed",
      closeReason: "target",
      pnlUsd: 0.85,
      lessonAction: "reinforce_target_hit_setup",
    });
    expect(snapshot.strategies[0]).toMatchObject({
      id: "kraken-btc-momentum",
      title: "BTC/USDT momentum continuation",
      status: "selected",
    });
    expect(snapshot.strategyDecision).toMatchObject({
      cycleId: "cycle-real",
      selectedStrategyId: "kraken-btc-momentum",
      selectedReason:
        "Picked BTC/USDT momentum continuation because the target-hit lesson reinforced it.",
      lessonsConsideredCount: 1,
    });
    expect(snapshot.strategyDecision?.scoring[0]).toMatchObject({
      strategyId: "kraken-btc-momentum",
      lessonAdjustment: "target-hit reinforcement",
      vectorScores: [
        expect.objectContaining({
          id: "signal_quality",
          label: "Signal quality",
          score: 72,
        }),
        expect.objectContaining({
          id: "spread_discipline",
          score: 84,
        }),
      ],
    });
    expect(snapshot.sessionRunbook).toMatchObject({
      sessionId: "kraken-session-test",
      cycleCount: 1,
      aggregatePnlUsd: 0.85,
      nextCycleScenario: "target",
    });
    expect(snapshot.sessionRunbook?.cycleTrace[0]).toMatchObject({
      cycleId: "cycle-real",
      result: "win",
    });
  });

  it("returns an empty strategize snapshot when artifacts are absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "autonomy-artifacts-empty-"));

    const snapshot = buildAutonomySnapshot(dir);

    expect(snapshot.source.kind).toBe("empty");
    expect(snapshot.phase).toBe("strategize");
    expect(snapshot.activeCycle).toBeNull();
    expect(snapshot.cycleHistory).toEqual([]);
    expect(snapshot.strategies).toHaveLength(5);
    expect(snapshot.sessionRunbook).toBeNull();
  });

  it("prefers live runtime state over completed JSONL artifacts", () => {
    const dir = mkdtempSync(join(tmpdir(), "autonomy-runtime-state-"));

    writeFileSync(
      join(dir, "runtime_state.json"),
      `${JSON.stringify({
        event_type: "kraken_spot.runtime_state.v1",
        updated_ts: 300,
        cycle_id: "kraken-cycle-live",
        cycle_number: 7,
        phase: "monitor_exit",
        status_line: "Paper position entered; monitoring target, stop, and timebox.",
        selected_strategy_id: "btcusdt-momentum-continuation",
        strategies: [
          {
            id: "btcusdt-momentum-continuation",
            rank: 1,
            domain: "crypto",
            title: "BTC/USDT momentum continuation",
            thesis: "Follow a clean short-horizon spot impulse.",
            entry_rule: "Last price up at least 18 bps with spread <= 8 bps",
            exit_rule: "+55 bps target, -30 bps stop",
            constraint_vector: "momentum with hard stop",
            risk_budget_usd: 25,
            confidence: 0.68,
            status: "selected",
          },
        ],
        decision: {
          cycle_id: "kraken-cycle-live",
          created_ts: 300,
          selected_strategy_id: "btcusdt-momentum-continuation",
          selected_rank: 1,
          domain: "crypto",
          symbol: "BTC/USDT",
          hypotheses_count: 1,
          lessons_considered_count: 0,
          lessons_considered: [],
          lesson_influences: [
            "No prior lessons found; using the baseline Kraken Spot ranking and fixed paper size.",
          ],
          selected_reason:
            "Picked BTC/USDT momentum continuation because it is the baseline live runtime setup.",
          scoring: [
            {
              strategy_id: "btcusdt-momentum-continuation",
              rank: 1,
              title: "BTC/USDT momentum continuation",
              score: 68,
              confidence: 0.68,
              risk_budget_usd: 25,
              constraint_vector: "momentum with hard stop",
              lesson_adjustment: "baseline score",
              rationale: "momentum with hard stop; confidence 0.68.",
              vector_scores: [
                {
                  id: "signal_quality",
                  label: "Signal quality",
                  score: 68,
                  rationale: "Confidence is 0.68.",
                },
              ],
            },
          ],
        },
        signal: {
          signal_id: "signal-live",
          strategy_id: "btcusdt-momentum-continuation",
          symbol: "BTC/USDT",
          instrument_id: "BTC/USDT.KRAKEN",
          side: "BUY",
          created_ts: 300,
          reference_price: 100.23,
          confidence: 0.72,
          passed: true,
          reason: "Momentum and spread satisfied selected constraints.",
          spread_bps: 4,
          momentum_bps: 23,
          suggested_notional: 25,
        },
        position: {
          signal_id: "signal-live",
          strategy_id: "btcusdt-momentum-continuation",
          instrument_id: "BTC/USDT.KRAKEN",
          market_title: "Kraken Spot BTC/USDT paper position",
          outcome: "BTC/USDT momentum continuation",
          side: "BUY",
          entry_price: 100.23,
          exit_price: null,
          current_price: 100.23,
          target_price: 100.78,
          stop_price: 99.93,
          size_usdc: 25,
          opened_ts: 300,
          closed_ts: null,
          pnl_usdc: 0,
          close_reason: null,
          status: "OPEN",
        },
        postmortem: null,
        lesson: null,
      })}\n`,
    );

    const snapshot = buildAutonomySnapshot(dir);

    expect(snapshot.source.kind).toBe("artifact");
    expect(snapshot.phase).toBe("monitor_exit");
    expect(snapshot.cycleNumber).toBe(7);
    expect(snapshot.statusLine).toBe(
      "Paper position entered; monitoring target, stop, and timebox.",
    );
    expect(snapshot.activeCycle).toMatchObject({
      cycleId: "kraken-cycle-live",
      marketTitle: "Kraken Spot BTC/USDT paper position",
      status: "open",
    });
    expect(snapshot.signal).toMatchObject({
      signalId: "signal-live",
      symbol: "BTC/USDT",
      passed: true,
      momentumBps: 23,
    });
    expect(snapshot.strategies[0]).toMatchObject({
      title: "BTC/USDT momentum continuation",
    });
    expect(snapshot.strategyDecision).toMatchObject({
      cycleId: "kraken-cycle-live",
      selectedStrategyId: "btcusdt-momentum-continuation",
    });
  });

  it("keeps no-entry postmortem adjustment aligned with the lesson", () => {
    const dir = mkdtempSync(join(tmpdir(), "autonomy-no-entry-"));

    writeFileSync(
      join(dir, "contract_cycles.jsonl"),
      jsonl([
        {
          cycle_id: "cycle-no-entry",
          created_ts: 302,
          status: "NO_ENTRY",
          signal_id: "signal-no-entry",
          position: null,
        },
      ]),
    );
    writeFileSync(
      join(dir, "contract_postmortems.jsonl"),
      jsonl([
        {
          cycle_id: "cycle-no-entry",
          created_ts: 302,
          result: "no_entry",
          close_reason: "no_signal",
          market_title: "Kraken Spot signal watch",
          side: "BUY",
          outcome: "No position opened",
          entry_price: null,
          exit_price: null,
          findings: [
            "No entry: impulse or spread did not clear the selected constraints.",
            "Capital stayed out of the market for this cycle.",
          ],
          next_adjustment:
            "Loosen exactly one entry threshold or wait for stronger impulse.",
        },
      ]),
    );
    writeFileSync(
      join(dir, "strategy_lessons.jsonl"),
      jsonl([
        {
          lesson_id: "lesson-no-entry",
          cycle_id: "cycle-no-entry",
          created_ts: 303,
          action: "relax_one_entry_constraint",
          recommendation:
            "Loosen one constraint next cycle; do not loosen spread and momentum together.",
        },
      ]),
    );

    const snapshot = buildAutonomySnapshot(dir);

    expect(snapshot.postmortems[0]).toMatchObject({
      headline: "Latest artifact postmortem preserved capital with no entry.",
      nextAdjustment:
        "Loosen exactly one entry threshold or wait for stronger impulse.",
    });
    expect(snapshot.lessons[0]).toMatchObject({
      action: "relax_one_entry_constraint",
    });
    expect(snapshot.cycleHistory[0]).toMatchObject({
      cycleId: "cycle-no-entry",
      status: "no_entry",
      closeReason: "no_signal",
      lessonAction: "relax_one_entry_constraint",
      summary: "Loosen exactly one entry threshold or wait for stronger impulse.",
    });
  });
});
