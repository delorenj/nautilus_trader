import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ActiveContractCycle,
  AutonomyPhase,
  CycleLedgerEntry,
  CyclePostmortem,
  SignalObservation,
  StrategyHypothesis,
  StrategyLesson,
} from "@/lib/stores/autonomy-store";

import type { AutonomySnapshot } from "./types";

type JsonRecord = Record<string, unknown>;
type StrategyDecision = NonNullable<AutonomySnapshot["strategyDecision"]>;
type StrategyDecisionScore = StrategyDecision["scoring"][number];
type StrategyDecisionVector = StrategyDecisionScore["vectorScores"][number];
type SessionRunbook = NonNullable<AutonomySnapshot["sessionRunbook"]>;
type SessionCycleTrace = SessionRunbook["cycleTrace"][number];

const DEFAULT_VAR_DIR = join(
  homedir(),
  "code/nautilus_trader/var/kraken_spot_autonomy",
);

export function autonomyArtifactVarDir(): string {
  return (
    process.env.KRAKEN_SPOT_BOT_VAR_DIR ??
    process.env.AUTONOMY_BOT_VAR_DIR ??
    process.env.POLIWALE_BOT_VAR_DIR ??
    DEFAULT_VAR_DIR
  );
}

function artifactFiles(varDir: string) {
  return {
    runtime: join(varDir, "runtime_state.json"),
    cycles: join(varDir, "contract_cycles.jsonl"),
    postmortems: join(varDir, "contract_postmortems.jsonl"),
    lessons: join(varDir, "strategy_lessons.jsonl"),
    signals: join(varDir, "signal_observations.jsonl"),
    strategies: join(varDir, "strategy_hypotheses.jsonl"),
    decisions: join(varDir, "strategy_decisions.jsonl"),
    sessionRunbook: join(varDir, "session_runbook.json"),
    sessionRunbooks: join(varDir, "session_runbooks.jsonl"),
  };
}

function readJson(path: string): JsonRecord | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readJsonl(path: string): JsonRecord[] {
  if (!existsSync(path)) {
    return [];
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        return [];
      }

      try {
        const parsed: unknown = JSON.parse(trimmed);
        return isRecord(parsed) ? [parsed] : [];
      } catch {
        return [];
      }
    });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => stringValue(item)).filter(Boolean);
}

function sideValue(value: unknown): "BUY" | "SELL" {
  return value === "SELL" ? "SELL" : "BUY";
}

function closeReasonValue(
  value: unknown,
): ActiveContractCycle["closeReason"] {
  if (value === "target" || value === "stop" || value === "timebox") {
    return value;
  }
  if (value === "max_hold") {
    return "timebox";
  }
  return null;
}

function phaseValue(value: unknown): AutonomyPhase | null {
  if (
    value === "strategize" ||
    value === "signal_watch" ||
    value === "monitor_exit" ||
    value === "postmortem" ||
    value === "learn"
  ) {
    return value;
  }

  return null;
}

function strategyStatusValue(value: unknown): StrategyHypothesis["status"] {
  if (
    value === "candidate" ||
    value === "selected" ||
    value === "running" ||
    value === "learned"
  ) {
    return value;
  }

  return "candidate";
}

function exitQuality(result: string): CyclePostmortem["exitQuality"] {
  if (result === "win") {
    return "good";
  }
  if (result === "loss") {
    return "bad";
  }
  return "neutral";
}

function cycleFromArtifact(event: JsonRecord): ActiveContractCycle | null {
  const position = event.position;
  if (!isRecord(position)) {
    return null;
  }

  const cycleId = stringValue(event.cycle_id);
  if (!cycleId) {
    return null;
  }

  const status = stringValue(position.status, stringValue(event.status));
  const entryPrice = numberValue(position.entry_price);
  const exitPrice =
    position.exit_price === null
      ? null
      : numberValue(position.exit_price, entryPrice);
  const currentPrice = numberValue(
    position.current_price,
    exitPrice ?? entryPrice,
  );
  const closedTs =
    position.closed_ts === null ? null : numberValue(position.closed_ts, 0);

  return {
    cycleId,
    strategyId: stringValue(
      position.strategy_id,
      stringValue(event.selected_strategy_id, "artifact-ledger"),
    ),
    signalKey: stringValue(
      position.signal_id,
      stringValue(event.signal_id, cycleId),
    ),
    marketTitle: stringValue(
      position.market_title,
      stringValue(event.market_title, "Unknown market"),
    ),
    outcome: stringValue(
      position.outcome,
      stringValue(event.outcome, "Outcome unavailable"),
    ),
    side: sideValue(position.side ?? event.side),
    entryPrice,
    currentPrice,
    targetPrice: numberValue(position.target_price, entryPrice),
    stopPrice: numberValue(position.stop_price, entryPrice),
    sizeUsd: numberValue(position.size_usdc),
    openedAt:
      numberValue(position.opened_ts, numberValue(event.opened_ts)) * 1_000,
    closedAt: closedTs ? closedTs * 1_000 : null,
    exitPrice,
    pnlUsd: numberValue(position.pnl_usdc, numberValue(event.pnl_usdc)),
    closeReason: closeReasonValue(position.close_reason ?? event.close_reason),
    status: status === "CLOSED" ? "closed" : "open",
  };
}

function signalFromArtifact(row: JsonRecord): SignalObservation | null {
  const signalId = stringValue(row.signal_id, stringValue(row.signalId));
  const strategyId = stringValue(row.strategy_id, stringValue(row.strategyId));
  if (!signalId) {
    return null;
  }

  return {
    signalId,
    strategyId,
    symbol: stringValue(row.symbol, "BTC/USDT"),
    instrumentId: stringValue(row.instrument_id, stringValue(row.instrumentId)),
    side: sideValue(row.side),
    createdAt: numberValue(row.created_ts, numberValue(row.createdAt)) * 1_000,
    referencePrice: numberValue(
      row.reference_price,
      numberValue(row.referencePrice),
    ),
    confidence: numberValue(row.confidence),
    passed: row.passed === true,
    reason: stringValue(row.reason, "Signal observation loaded from artifacts."),
    spreadBps: numberValue(row.spread_bps, numberValue(row.spreadBps)),
    momentumBps: numberValue(row.momentum_bps, numberValue(row.momentumBps)),
    suggestedNotional: numberValue(
      row.suggested_notional,
      numberValue(row.suggestedNotional),
    ),
  };
}

function postmortemFromArtifact(row: JsonRecord): CyclePostmortem | null {
  const cycleId = stringValue(row.cycle_id);
  if (!cycleId) {
    return null;
  }

  const result = stringValue(row.result);
  const closeReason = stringValue(row.close_reason);
  const nextAdjustment = stringValue(row.next_adjustment);
  const findingsRaw = Array.isArray(row.findings) ? row.findings : [];
  const findings = findingsRaw
    .map((finding) => stringValue(finding))
    .filter(Boolean);
  const exitPrice = numberValue(row.exit_price, numberValue(row.entry_price));
  const entryPrice = numberValue(row.entry_price);

  return {
    cycleId,
    createdAt: numberValue(row.created_ts, numberValue(row.closed_ts)) * 1_000,
    headline:
      result === "win"
        ? "Latest artifact postmortem found a winning cycle."
        : result === "loss"
          ? "Latest artifact postmortem found a loss to learn from."
          : result === "no_entry"
            ? "Latest artifact postmortem preserved capital with no entry."
            : "Latest artifact postmortem found no clear edge.",
    exitQuality: exitQuality(result),
    findings:
      findings.length > 0
        ? findings
        : [
            `${stringValue(row.side, "BUY")} ${stringValue(row.outcome, "outcome")} entered at ${entryPrice.toFixed(3)} and exited at ${exitPrice.toFixed(3)}.`,
            `Close reason: ${closeReason || "unknown"}.`,
          ],
    nextAdjustment:
      nextAdjustment ||
      (result === "win"
        ? "Preserve the setup as positive evidence without raising size automatically."
        : result === "no_entry"
          ? "Loosen exactly one entry threshold or wait for stronger impulse."
          : "Tighten the next entry gate or cool down this token/side."),
  };
}

function lessonFromArtifact(row: JsonRecord): StrategyLesson | null {
  const cycleId = stringValue(row.cycle_id);
  const lessonId = stringValue(row.lesson_id);
  if (!cycleId || !lessonId) {
    return null;
  }

  return {
    cycleId,
    lessonId,
    createdAt: numberValue(row.created_ts) * 1_000,
    summary: stringValue(row.recommendation, stringValue(row.action)),
    appliesTo: `${stringValue(row.market_title, "market")} / ${stringValue(row.side, "side")} / ${stringValue(row.outcome, "outcome")}`,
    action: stringValue(row.action, "observe"),
  };
}

function cycleHistoryFromArtifact(
  event: JsonRecord,
  postmortem: CyclePostmortem | null,
  lesson: StrategyLesson | null,
): CycleLedgerEntry | null {
  const cycleId = stringValue(event.cycle_id);
  if (!cycleId) {
    return null;
  }

  const position = event.position;
  const createdAt =
    numberValue(event.created_ts, postmortem ? postmortem.createdAt / 1_000 : 0) *
    1_000;

  if (isRecord(position)) {
    const closeReason = closeReasonValue(position.close_reason ?? event.close_reason);
    return {
      cycleId,
      createdAt,
      status: "closed",
      marketTitle: stringValue(
        position.market_title,
        stringValue(event.market_title, "Kraken Spot paper position"),
      ),
      outcome: stringValue(
        position.outcome,
        stringValue(event.outcome, "Outcome unavailable"),
      ),
      side: sideValue(position.side ?? event.side),
      pnlUsd: numberValue(position.pnl_usdc, numberValue(event.pnl_usdc)),
      closeReason,
      lessonAction: lesson?.action ?? null,
      summary:
        postmortem?.nextAdjustment ??
        lesson?.summary ??
        `Closed with ${closeReason ?? "unknown"} exit evidence.`,
    };
  }

  return {
    cycleId,
    createdAt,
    status: "no_entry",
    marketTitle: "Kraken Spot signal watch",
    outcome: "No position opened",
    side: sideValue(event.side),
    pnlUsd: 0,
    closeReason: "no_signal",
    lessonAction: lesson?.action ?? null,
    summary:
      postmortem?.nextAdjustment ??
      lesson?.summary ??
      "No entry recorded; preserve capital and adjust one constraint.",
  };
}

function cycleHistoryFromArtifacts(
  cycles: JsonRecord[],
  postmortems: CyclePostmortem[],
  lessons: StrategyLesson[],
): CycleLedgerEntry[] {
  const postmortemByCycle = new Map(
    postmortems.map((postmortem) => [postmortem.cycleId, postmortem]),
  );
  const lessonByCycle = new Map(lessons.map((lesson) => [lesson.cycleId, lesson]));

  return cycles
    .map((cycle) =>
      cycleHistoryFromArtifact(
        cycle,
        postmortemByCycle.get(stringValue(cycle.cycle_id)) ?? null,
        lessonByCycle.get(stringValue(cycle.cycle_id)) ?? null,
      ),
    )
    .filter((item): item is CycleLedgerEntry => item !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 12);
}

function strategyFromArtifact(row: JsonRecord): StrategyHypothesis | null {
  const id = stringValue(row.id);
  if (!id) {
    return null;
  }

  return {
    id,
    rank: numberValue(row.rank, 99),
    domain: stringValue(row.domain, "crypto"),
    title: stringValue(row.title, "Artifact strategy"),
    thesis: stringValue(row.thesis, "Loaded from strategy artifact."),
    entryRule: stringValue(row.entry_rule, stringValue(row.entryRule)),
    exitRule: stringValue(row.exit_rule, stringValue(row.exitRule)),
    constraintVector: stringValue(
      row.constraint_vector,
      stringValue(row.constraintVector),
    ),
    riskBudgetUsd: numberValue(row.risk_budget_usd, numberValue(row.riskBudgetUsd)),
    confidence: numberValue(row.confidence, 0),
    status: strategyStatusValue(row.status),
  };
}

function latestStrategySlate(rows: JsonRecord[]): StrategyHypothesis[] {
  const latestTs = Math.max(
    -Infinity,
    ...rows.map((row) => numberValue(row.created_ts, -Infinity)),
  );
  if (!Number.isFinite(latestTs)) {
    return [];
  }

  return rows
    .filter((row) => numberValue(row.created_ts, -Infinity) === latestTs)
    .map(strategyFromArtifact)
    .filter((strategy): strategy is StrategyHypothesis => strategy !== null)
    .sort((left, right) => left.rank - right.rank)
    .map((strategy, index) => ({
      ...strategy,
      status: index === 0 ? "selected" : "candidate",
    }));
}

function decisionScoreFromArtifact(
  row: JsonRecord,
): StrategyDecisionScore | null {
  const strategyId = stringValue(row.strategy_id, stringValue(row.strategyId));
  if (!strategyId) {
    return null;
  }

  return {
    strategyId,
    rank: numberValue(row.rank, 99),
    title: stringValue(row.title, "Strategy hypothesis"),
    score: numberValue(row.score),
    confidence: numberValue(row.confidence),
    riskBudgetUsd: numberValue(
      row.risk_budget_usd,
      numberValue(row.riskBudgetUsd),
    ),
    constraintVector: stringValue(
      row.constraint_vector,
      stringValue(row.constraintVector),
    ),
    lessonAdjustment: stringValue(
      row.lesson_adjustment,
      stringValue(row.lessonAdjustment),
    ),
    rationale: stringValue(row.rationale, "Loaded strategy score from artifacts."),
    vectorScores: vectorScoresFromArtifact(
      row.vector_scores ?? row.vectorScores,
    ),
  };
}

function vectorScoresFromArtifact(value: unknown): StrategyDecisionVector[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((item) => ({
    id: stringValue(item.id, "score"),
    label: stringValue(item.label, "Score"),
    score: numberValue(item.score),
    rationale: stringValue(item.rationale, "Loaded vector score from artifacts."),
  }));
}

function decisionFromArtifact(
  row: JsonRecord,
): StrategyDecision | null {
  const cycleId = stringValue(row.cycle_id, stringValue(row.cycleId));
  const selectedStrategyId = stringValue(
    row.selected_strategy_id,
    stringValue(row.selectedStrategyId),
  );
  if (!cycleId || !selectedStrategyId) {
    return null;
  }

  const scoringRaw = Array.isArray(row.scoring) ? row.scoring : [];
  const scoring = scoringRaw
    .filter(isRecord)
    .map(decisionScoreFromArtifact)
    .filter((score): score is StrategyDecisionScore => score !== null);

  return {
    cycleId,
    createdAt:
      numberValue(row.created_ts, numberValue(row.createdAt, 0)) * 1_000,
    selectedStrategyId,
    selectedRank: numberValue(
      row.selected_rank,
      numberValue(row.selectedRank, 1),
    ),
    domain: stringValue(row.domain, "crypto"),
    symbol: stringValue(row.symbol, "BTC/USDT"),
    hypothesesCount: numberValue(
      row.hypotheses_count,
      numberValue(row.hypothesesCount, scoring.length),
    ),
    lessonsConsideredCount: numberValue(
      row.lessons_considered_count,
      numberValue(row.lessonsConsideredCount),
    ),
    lessonsConsidered: stringArrayValue(
      row.lessons_considered ?? row.lessonsConsidered,
    ),
    lessonInfluences: stringArrayValue(
      row.lesson_influences ?? row.lessonInfluences,
    ),
    selectedReason: stringValue(
      row.selected_reason,
      stringValue(row.selectedReason, "Strategy decision loaded from artifacts."),
    ),
    scoring,
  };
}

function sessionCycleTraceFromArtifact(row: JsonRecord): SessionCycleTrace | null {
  const cycleId = stringValue(row.cycle_id, stringValue(row.cycleId));
  if (!cycleId) {
    return null;
  }

  return {
    cycleId,
    scenario: stringValue(row.scenario, "target"),
    result: stringValue(row.result, "unknown"),
    closeReason: stringValue(row.close_reason, stringValue(row.closeReason)),
    pnlUsd: numberValue(row.pnl_usdc, numberValue(row.pnlUsd)),
    lessonAction: stringValue(row.lesson_action, stringValue(row.lessonAction)),
    nextAdjustment: stringValue(
      row.next_adjustment,
      stringValue(row.nextAdjustment),
    ),
  };
}

function sessionRunbookFromArtifact(row: JsonRecord): SessionRunbook | null {
  const sessionId = stringValue(row.session_id, stringValue(row.sessionId));
  if (!sessionId) {
    return null;
  }

  const traceRaw = Array.isArray(row.cycle_trace)
    ? row.cycle_trace
    : Array.isArray(row.cycleTrace)
      ? row.cycleTrace
      : [];
  const cycleTrace = traceRaw
    .filter(isRecord)
    .map(sessionCycleTraceFromArtifact)
    .filter((item): item is SessionCycleTrace => item !== null);
  const status = stringValue(row.status, "completed");

  return {
    sessionId,
    startedAt:
      numberValue(row.started_ts, numberValue(row.startedAt, 0)) * 1_000,
    completedAt:
      numberValue(row.completed_ts, numberValue(row.completedAt, 0)) * 1_000,
    status:
      status === "running" || status === "failed" || status === "completed"
        ? status
        : "completed",
    cycleCount: numberValue(
      row.cycle_count,
      numberValue(row.cycleCount, cycleTrace.length),
    ),
    scenarioSequence: stringArrayValue(
      row.scenario_sequence ?? row.scenarioSequence,
    ),
    cycleIds: stringArrayValue(row.cycle_ids ?? row.cycleIds),
    aggregatePnlUsd: numberValue(
      row.aggregate_pnl_usdc,
      numberValue(row.aggregatePnlUsd),
    ),
    wins: numberValue(row.wins),
    losses: numberValue(row.losses),
    noEntries: numberValue(row.no_entries, numberValue(row.noEntries)),
    latestLessonAction: stringValue(
      row.latest_lesson_action,
      stringValue(row.latestLessonAction),
    ),
    nextCycleScenario: stringValue(
      row.next_cycle_scenario,
      stringValue(row.nextCycleScenario, "target"),
    ),
    nextCycleRecommendation: stringValue(
      row.next_cycle_recommendation,
      stringValue(
        row.nextCycleRecommendation,
        "Start the next cycle with the latest lesson.",
      ),
    ),
    operatorSummary: stringValue(
      row.operator_summary,
      stringValue(row.operatorSummary, "Session runbook loaded."),
    ),
    cycleTrace,
  };
}

function runtimeStrategySlate(row: JsonRecord): StrategyHypothesis[] {
  const strategies = Array.isArray(row.strategies) ? row.strategies : [];
  return strategies
    .filter(isRecord)
    .map(strategyFromArtifact)
    .filter((strategy): strategy is StrategyHypothesis => strategy !== null)
    .sort((left, right) => left.rank - right.rank);
}

function inferDomain(text: string): string {
  const haystack = text.toLowerCase();
  if (/\b(knicks|nba|nhl|nfl|epl|ucl|madrid|liverpool|stanley|cup)\b/.test(haystack)) {
    return "sports";
  }
  if (/\b(btc|bitcoin|eth|ethereum|sol|crypto)\b/.test(haystack)) {
    return "crypto";
  }
  if (/\b(weather|temperature|rain|snow|hurricane)\b/.test(haystack)) {
    return "weather";
  }
  if (/\b(fed|rates|recession|eurozone|inflation)\b/.test(haystack)) {
    return "macro";
  }
  if (/\b(senate|election|president|politic)\b/.test(haystack)) {
    return "politics";
  }
  return "general";
}

function strategyStatus(rank: number): StrategyHypothesis["status"] {
  return rank === 1 ? "selected" : "candidate";
}

function artifactStrategy(
  rank: number,
  overrides: Omit<StrategyHypothesis, "rank" | "status">,
): StrategyHypothesis {
  return {
    ...overrides,
    rank,
    status: strategyStatus(rank),
  };
}

function deriveArtifactStrategies(
  cycle: ActiveContractCycle | null,
  postmortems: CyclePostmortem[],
  lessons: StrategyLesson[],
): StrategyHypothesis[] {
  const latestLesson = lessons[0] ?? null;
  const latestPostmortem = postmortems[0] ?? null;
  const marketText =
    cycle?.marketTitle ??
    latestLesson?.appliesTo ??
    latestPostmortem?.findings.join(" ") ??
    "recent contract cycle";
  const domain = inferDomain(marketText);
  const latestAction = latestLesson?.action ?? "observe";
  const cooldown =
    latestAction === "cooldown_symbol_after_loss" ||
    latestAction === "cooldown_token_after_loss";
  const positive =
    latestAction === "reinforce_target_hit_setup" ||
    (latestAction !== "observe_no_clear_edge" &&
      !cooldown &&
      (cycle ? cycle.pnlUsd > 0 : latestPostmortem?.exitQuality === "good"));

  return [
    artifactStrategy(1, {
      id: "artifact-latest-lesson",
      domain,
      title:
        cooldown
          ? "Cooldown before re-entry"
          : latestAction === "reinforce_target_hit_setup"
            ? "Reinforce target-hit setup"
            : "No-edge lesson audit",
      thesis:
        latestLesson?.summary ??
        latestPostmortem?.nextAdjustment ??
        "Use the latest artifact-backed postmortem as the next strategy constraint.",
      entryRule:
        cooldown
          ? "Skip same token/side until stronger evidence appears"
          : "Require the next signal to beat the last cycle's quality",
      exitRule: cycle?.closeReason
        ? `Respect ${cycle.closeReason} exit evidence from the latest cycle`
        : "Use target, stop, and max-hold exits",
      constraintVector: positive ? "preserve edge" : "tighten entry",
      riskBudgetUsd: Math.max(1, Math.min(16, cycle?.sizeUsd ?? 8)),
      confidence: positive ? 0.74 : 0.62,
    }),
    artifactStrategy(2, {
      id: "artifact-domain-scout",
      domain,
      title: `${domain} continuation scout`,
      thesis: `Look for a cleaner ${domain} setup that improves on the latest contract cycle.`,
      entryRule: "Fresh signal, no active cooldown, tighter spread than last entry",
      exitRule: "Take target quickly; abandon stale max-hold repeats",
      constraintVector: "domain fit",
      riskBudgetUsd: 8,
      confidence: 0.66,
    }),
    artifactStrategy(3, {
      id: "artifact-loss-avoidance",
      domain: "cross-domain",
      title: "Loss avoidance gate",
      thesis: "Convert loss and idle-close evidence into a hard skip before any new entry.",
      entryRule: "Reject token/side pairs with active cooldown lessons",
      exitRule: "Prefer explicit stop or target over passive timebox",
      constraintVector: "drawdown control",
      riskBudgetUsd: 6,
      confidence: 0.63,
    }),
    artifactStrategy(4, {
      id: "artifact-winner-preservation",
      domain: "cross-domain",
      title: "Winner preservation",
      thesis: "Treat target-hit lessons as evidence, but do not increase size automatically.",
      entryRule: "Require repeated signal agreement before scaling",
      exitRule: "Use the same target first; only trail after confirmed repeat edge",
      constraintVector: "no size creep",
      riskBudgetUsd: 7,
      confidence: 0.58,
    }),
    artifactStrategy(5, {
      id: "artifact-starvation-escape",
      domain: "general",
      title: "Signal starvation escape",
      thesis: "If no contract enters, loosen exactly one constraint and keep the risk cap fixed.",
      entryRule: "Relax one threshold after a no-entry run, never all at once",
      exitRule: "Short timebox until the relaxed rule proves itself",
      constraintVector: "controlled exploration",
      riskBudgetUsd: 4,
      confidence: 0.51,
    }),
  ];
}

function latestByTimestamp(rows: JsonRecord[], key: string): JsonRecord | null {
  let latest: JsonRecord | null = null;
  let latestTs = -Infinity;

  for (const row of rows) {
    const ts = numberValue(row[key]);
    if (ts >= latestTs) {
      latestTs = ts;
      latest = row;
    }
  }

  return latest;
}

function inferPhase(
  cycle: ActiveContractCycle | null,
  postmortems: CyclePostmortem[],
  lessons: StrategyLesson[],
): AutonomyPhase {
  if (lessons.length > 0) {
    return "learn";
  }
  if (postmortems.length > 0) {
    return "postmortem";
  }
  if (cycle !== null) {
    return cycle.status === "open" ? "monitor_exit" : "postmortem";
  }
  return "strategize";
}

function snapshotFromRuntimeState(
  runtime: JsonRecord,
  files: ReturnType<typeof artifactFiles>,
  varDir: string,
  loadedAt: number,
  cycleHistory: CycleLedgerEntry[],
  sessionRunbook: SessionRunbook | null,
): AutonomySnapshot | null {
  const phase = phaseValue(runtime.phase);
  const cycleId = stringValue(runtime.cycle_id);
  if (phase === null || !cycleId) {
    return null;
  }

  const position = runtime.position;
  const activeCycle = isRecord(position)
    ? cycleFromArtifact({
        cycle_id: cycleId,
        signal_id: runtime.signal_id,
        position,
      })
    : null;
  const postmortem = isRecord(runtime.postmortem)
    ? postmortemFromArtifact(runtime.postmortem)
    : null;
  const lesson = isRecord(runtime.lesson) ? lessonFromArtifact(runtime.lesson) : null;
  const signal = isRecord(runtime.signal) ? signalFromArtifact(runtime.signal) : null;
  const strategies = runtimeStrategySlate(runtime);
  const strategyDecision = isRecord(runtime.decision)
    ? decisionFromArtifact(runtime.decision)
    : null;

  return {
    source: {
      kind: "artifact",
      varDir,
      loadedAt,
      message: "Loaded live Kraken Spot runtime state.",
      files,
    },
    phase,
    cycleNumber: Math.max(1, numberValue(runtime.cycle_number, 1)),
    statusLine: stringValue(runtime.status_line, "Loaded Kraken Spot runtime state."),
    strategies:
      strategies.length > 0
        ? strategies
        : deriveArtifactStrategies(activeCycle, postmortem ? [postmortem] : [], lesson ? [lesson] : []),
    strategyDecision,
    sessionRunbook,
    signal,
    activeCycle,
    cycleHistory,
    postmortems: postmortem ? [postmortem] : [],
    lessons: lesson ? [lesson] : [],
  };
}

export function buildAutonomySnapshot(varDir = autonomyArtifactVarDir()): AutonomySnapshot {
  const files = artifactFiles(varDir);
  const loadedAt = Date.now();

  try {
    const cycles = readJsonl(files.cycles);
    const signals = readJsonl(files.signals);
    const strategySlate = latestStrategySlate(readJsonl(files.strategies));
    const decisions = readJsonl(files.decisions)
      .map(decisionFromArtifact)
      .filter((item): item is StrategyDecision => item !== null)
      .sort((left, right) => right.createdAt - left.createdAt);
    const sessionRows = [
      ...readJsonl(files.sessionRunbooks),
      ...[readJson(files.sessionRunbook)].filter(
        (item): item is JsonRecord => item !== null,
      ),
    ];
    const sessionRunbook =
      sessionRows
        .map(sessionRunbookFromArtifact)
        .filter((item): item is SessionRunbook => item !== null)
        .sort((left, right) => right.completedAt - left.completedAt)[0] ?? null;
    const postmortems = readJsonl(files.postmortems)
      .map(postmortemFromArtifact)
      .filter((item): item is CyclePostmortem => item !== null)
      .sort((left, right) => right.createdAt - left.createdAt);
    const lessons = readJsonl(files.lessons)
      .map(lessonFromArtifact)
      .filter((item): item is StrategyLesson => item !== null)
      .sort((left, right) => right.createdAt - left.createdAt);
    const cycleHistory = cycleHistoryFromArtifacts(cycles, postmortems, lessons);

    const runtime = readJson(files.runtime);
    if (runtime !== null) {
      const snapshot = snapshotFromRuntimeState(
        runtime,
        files,
        varDir,
        loadedAt,
        cycleHistory,
        sessionRunbook,
      );
      if (snapshot !== null) {
        return snapshot;
      }
    }

    const latestCycleEvent = latestByTimestamp(cycles, "created_ts");
    const activeCycle = latestCycleEvent ? cycleFromArtifact(latestCycleEvent) : null;
    const latestSignalEvent = latestByTimestamp(signals, "created_ts");
    const signal = latestSignalEvent ? signalFromArtifact(latestSignalEvent) : null;
    const phase = inferPhase(activeCycle, postmortems, lessons);
    const cycleIds = new Set([
      ...cycles.map((row) => row.cycle_id).filter(Boolean),
      ...postmortems.map((row) => row.cycleId),
      ...lessons.map((row) => row.cycleId),
    ]);
    const cycleNumber = Math.max(1, cycleIds.size);
    const kind =
      cycles.length > 0 ||
      postmortems.length > 0 ||
      lessons.length > 0 ||
      strategySlate.length > 0
        ? "artifact"
        : "empty";
    const strategies =
      strategySlate.length > 0
        ? strategySlate
        : deriveArtifactStrategies(activeCycle, postmortems, lessons);
    const strategyDecision = decisions[0] ?? null;

    return {
      source: {
        kind,
        varDir,
        loadedAt,
        message:
          kind === "artifact"
            ? "Loaded local autonomy cycle artifacts."
            : "No local bot cycle artifacts found yet.",
        files,
      },
      phase,
      cycleNumber,
      statusLine:
        phase === "learn"
          ? "Loaded the latest postmortem lesson from the autonomy ledger."
          : phase === "monitor_exit"
            ? "Loaded an open trade cycle from the autonomy ledger."
            : "Loaded autonomy artifacts; ready to start a new cycle.",
      strategies,
      strategyDecision,
      sessionRunbook,
      signal,
      activeCycle,
      cycleHistory,
      postmortems: postmortems.slice(0, 8),
      lessons: lessons.slice(0, 8),
    };
  } catch (error) {
    return {
      source: {
        kind: "error",
        varDir,
        loadedAt,
        message: error instanceof Error ? error.message : "Unable to load artifacts.",
        files,
      },
      phase: "strategize",
      cycleNumber: 1,
      statusLine: "Artifact load failed; dashboard is using local simulation.",
      strategies: deriveArtifactStrategies(null, [], []),
      strategyDecision: null,
      sessionRunbook: null,
      signal: null,
      activeCycle: null,
      cycleHistory: [],
      postmortems: [],
      lessons: [],
    };
  }
}
