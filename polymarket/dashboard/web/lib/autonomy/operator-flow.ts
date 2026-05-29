import type {
  ActiveContractCycle,
  AutonomyPhase,
  CyclePostmortem,
  SignalObservation,
  StrategyHypothesis,
  StrategyLesson,
} from "@/lib/stores/autonomy-store";

import type { ExecutionSubmitState } from "./execution-submit";
import type {
  AutonomySnapshot,
  StrategyDecision,
  StrategyDecisionVector,
} from "./types";

export type OperatorFlowStepId =
  | "ideate"
  | "read_signal"
  | "manage_position"
  | "postmortem"
  | "learn";

export type OperatorFlowStepState =
  | "pending"
  | "active"
  | "complete"
  | "blocked";

export interface OperatorFlowMetric {
  label: string;
  value: string;
  tone: "neutral" | "positive" | "negative" | "warning";
}

export interface OperatorFlowStep {
  id: OperatorFlowStepId;
  phase: AutonomyPhase;
  index: number;
  label: string;
  state: OperatorFlowStepState;
  headline: string;
  detail: string;
  operatorCue: string;
  evidence: string[];
  metrics: OperatorFlowMetric[];
}

export interface OperatorFlowStrategy {
  id: string;
  rank: number;
  domain: string;
  title: string;
  thesis: string;
  entryRule: string;
  exitRule: string;
  constraintVector: string;
  riskBudgetUsd: number;
  confidence: number;
  status: StrategyHypothesis["status"];
  selected: boolean;
  vectorScores: StrategyDecisionVector[];
}

export interface OperatorFlowSnapshot {
  generatedAt: number;
  cycleId: string;
  phase: AutonomyPhase;
  summary: string;
  nextOperatorAction: string;
  repeatReady: boolean;
  strategySlate: OperatorFlowStrategy[];
  steps: OperatorFlowStep[];
}

type OperatorFlowInput = Omit<AutonomySnapshot, "source"> & {
  source?: AutonomySnapshot["source"] | null;
  execution?: ExecutionSubmitState | null;
};

const PHASE_ORDER: AutonomyPhase[] = [
  "strategize",
  "signal_watch",
  "monitor_exit",
  "postmortem",
  "learn",
];

function phaseIndex(phase: AutonomyPhase) {
  return PHASE_ORDER.indexOf(phase);
}

function stepState({
  phase,
  stepPhase,
  noEntryFinal,
}: {
  phase: AutonomyPhase;
  stepPhase: AutonomyPhase;
  noEntryFinal: boolean;
}): OperatorFlowStepState {
  if (noEntryFinal && stepPhase === "monitor_exit") {
    return "blocked";
  }

  const current = phaseIndex(phase);
  const step = phaseIndex(stepPhase);
  if (step < current) {
    return "complete";
  }
  if (step === current) {
    return "active";
  }
  return "pending";
}

function strategyFor(snapshot: OperatorFlowInput): StrategyHypothesis | null {
  if (snapshot.strategyDecision?.selectedStrategyId) {
    const selected = snapshot.strategies.find(
      (strategy) => strategy.id === snapshot.strategyDecision?.selectedStrategyId,
    );
    if (selected) {
      return selected;
    }
  }

  return (
    snapshot.strategies.find((strategy) => strategy.status !== "candidate") ??
    snapshot.strategies[0] ??
    null
  );
}

function strategySlateFor(
  strategies: StrategyHypothesis[],
  selectedStrategyId: string | null,
  decision: StrategyDecision | null | undefined,
): OperatorFlowStrategy[] {
  const scoresByStrategyId = new Map(
    (decision?.scoring ?? []).map((score) => [score.strategyId, score]),
  );

  return [...strategies]
    .sort((left, right) => left.rank - right.rank)
    .map((strategy) => {
      const score = scoresByStrategyId.get(strategy.id);

      return {
        id: strategy.id,
        rank: strategy.rank,
        domain: strategy.domain,
        title: strategy.title,
        thesis: strategy.thesis,
        entryRule: strategy.entryRule,
        exitRule: strategy.exitRule,
        constraintVector: strategy.constraintVector,
        riskBudgetUsd: strategy.riskBudgetUsd,
        confidence: strategy.confidence,
        status: strategy.status,
        selected: strategy.id === selectedStrategyId,
        vectorScores: score?.vectorScores ?? [],
      };
    });
}

function cycleIdFor(snapshot: OperatorFlowInput) {
  return (
    snapshot.activeCycle?.cycleId ??
    snapshot.cycleHistory[0]?.cycleId ??
    snapshot.signal?.signalId.replace(/^signal-/, "") ??
    `cycle-${snapshot.cycleNumber.toString().padStart(4, "0")}`
  );
}

function money(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} USD`;
}

function percent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function price(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}

function metric(
  label: string,
  value: string,
  tone: OperatorFlowMetric["tone"] = "neutral",
): OperatorFlowMetric {
  return { label, value, tone };
}

function signalEvidence(signal: SignalObservation | null) {
  if (signal === null) {
    return ["No signal observation has been recorded for this cycle yet."];
  }

  return [
    `${signal.symbol} ${signal.side} at ${price(signal.referencePrice)}.`,
    `Momentum ${signal.momentumBps.toFixed(2)} bps; spread ${signal.spreadBps.toFixed(2)} bps.`,
    signal.reason,
  ];
}

function decisionEvidence(
  decision: StrategyDecision | null | undefined,
  strategy: StrategyHypothesis | null,
) {
  if (!decision || strategy === null) {
    if (strategy === null) {
      return ["Strategy slate is empty."];
    }

    return [
      `Thesis: ${strategy.thesis}`,
      `Entry: ${strategy.entryRule}`,
      `Exit: ${strategy.exitRule}`,
    ];
  }

  const score =
    decision.scoring.find((item) => item.strategyId === decision.selectedStrategyId) ??
    decision.scoring[0] ??
    null;
  const influences =
    decision.lessonInfluences.length > 0
      ? decision.lessonInfluences.slice(0, 2)
      : ["No prior lesson changed this slate."];
  const vectorLine =
    score && score.vectorScores.length > 0
      ? `Vectors: ${score.vectorScores
          .slice(0, 6)
          .map((vector) => `${vector.label} ${vector.score.toFixed(1)}`)
          .join("; ")}.`
      : null;

  return [
    `Why now: ${decision.selectedReason}`,
    ...influences,
    score
      ? `Score ${score.score.toFixed(1)}: ${score.rationale}`
      : `Selected rank ${decision.selectedRank} from ${decision.hypothesesCount} hypotheses.`,
    vectorLine,
  ]
    .filter((item): item is string => item !== null)
    .slice(0, 5);
}

function positionEvidence(cycle: ActiveContractCycle | null) {
  if (cycle === null) {
    return [
      "No position is open for this cycle.",
      "If signal watch expires, the bot records no-entry instead of forcing a trade.",
    ];
  }

  return [
    `${cycle.side} ${cycle.outcome} opened at ${price(cycle.entryPrice)}.`,
    `Target ${price(cycle.targetPrice)}, stop ${price(cycle.stopPrice)}, current ${price(cycle.currentPrice)}.`,
    cycle.status === "closed"
      ? `Exited by ${cycle.closeReason ?? "rule"} for ${money(cycle.pnlUsd)}.`
      : "Still monitoring target, stop, and timebox.",
  ];
}

function executionReconciliationEvidence(
  execution: ExecutionSubmitState | null | undefined,
  cycleId: string | null,
) {
  const reconciliation = execution?.reconciliation;
  if (!reconciliation) {
    return [];
  }
  if (cycleId !== null && reconciliation.cycleId !== cycleId) {
    return [
      `Latest execution reconciliation belongs to ${reconciliation.cycleId ?? "another cycle"}; current cycle still needs a dry-run record.`,
    ];
  }

  if (reconciliation.readyForPostmortem && reconciliation.entryFill && reconciliation.exitFill) {
    const fillCount =
      reconciliation.fills?.length ||
      [reconciliation.entryFill, reconciliation.exitFill].filter(Boolean).length;
    return [
      `Execution dry-run reconciled ${fillCount} fill legs for postmortem handoff.`,
      `Entry fill ${reconciliation.entryFill.filledQuantity?.toFixed(8) ?? "-"} ${reconciliation.entryFill.symbol} at ${price(reconciliation.entryFill.averageFillPrice)}.`,
      `Exit fill ${reconciliation.exitFill.role.replaceAll("_", " ")} at ${price(reconciliation.exitFill.averageFillPrice)} for ${money(reconciliation.exitFill.realizedPnlUsd ?? 0)}.`,
    ];
  }

  if (reconciliation.status === "dry_run_reconciled" && reconciliation.entryFill) {
    return [
      "Execution dry-run has an entry fill shape; exit fill waits for a closed cycle.",
      `Entry fill ${reconciliation.entryFill.filledQuantity?.toFixed(8) ?? "-"} ${reconciliation.entryFill.symbol} at ${price(reconciliation.entryFill.averageFillPrice)}.`,
    ];
  }

  if (execution?.attempt?.status === "LIVE_COMMAND_READY") {
    return [
      "Nautilus live command descriptor is ready for review, but no Kraken order was submitted.",
      "Fill reconciliation remains empty until a live submitter records Kraken order ids.",
    ];
  }

  return [];
}

function postmortemEvidence(postmortem: CyclePostmortem | null) {
  if (postmortem === null) {
    return ["Postmortem waits for either a closed position or a no-entry result."];
  }

  return [
    postmortem.headline,
    ...postmortem.findings.slice(0, 2),
    `Next adjustment: ${postmortem.nextAdjustment}`,
  ];
}

function lessonEvidence(lesson: StrategyLesson | null) {
  if (lesson === null) {
    return ["Lesson writeback waits for the postmortem to finish."];
  }

  return [
    lesson.summary,
    `Applies to ${lesson.appliesTo}.`,
    `Next cycle action: ${lesson.action.replaceAll("_", " ")}.`,
  ];
}

function sessionEvidence(snapshot: OperatorFlowInput) {
  const session = snapshot.sessionRunbook;
  if (!session || snapshot.phase !== "learn") {
    return [];
  }

  return [
    session.operatorSummary,
    `Next rehearsal: ${session.nextCycleScenario}.`,
    `Session mix: ${session.wins} win(s), ${session.losses} loss(es), ${session.noEntries} no-entry branch(es).`,
  ];
}

function summaryFor({
  phase,
  cycle,
  signal,
  lesson,
  sessionSummary,
  statusLine,
  noEntryFinal,
}: {
  phase: AutonomyPhase;
  cycle: ActiveContractCycle | null;
  signal: SignalObservation | null;
  lesson: StrategyLesson | null;
  sessionSummary?: string | null;
  statusLine: string;
  noEntryFinal: boolean;
}) {
  if (phase === "learn" && sessionSummary) {
    return sessionSummary;
  }
  if (noEntryFinal) {
    return "No-entry branch completed; capital stayed out and the lesson is ready for the next slate.";
  }
  if (phase === "learn" && lesson !== null) {
    return "Lesson is written back; the next strategy slate can use it.";
  }
  if (cycle?.status === "open") {
    return "Position is live in paper mode; the bot is guarding target, stop, and timebox.";
  }
  if (cycle?.status === "closed") {
    return `Cycle exited by ${cycle.closeReason ?? "rule"} for ${money(cycle.pnlUsd)}.`;
  }
  if (signal?.passed === false) {
    return "No-entry branch is active; capital stayed out while the bot prepares a constraint lesson.";
  }
  return statusLine;
}

function nextActionFor(snapshot: OperatorFlowInput) {
  if (snapshot.phase === "learn" && snapshot.sessionRunbook) {
    return snapshot.sessionRunbook.nextCycleRecommendation;
  }
  if (snapshot.phase === "strategize") {
    return "Review the ranked hypotheses, then run a paper cycle.";
  }
  if (snapshot.phase === "signal_watch") {
    return "Watch the signal gate; the bot will enter only if momentum and spread clear.";
  }
  if (snapshot.phase === "monitor_exit") {
    return "Watch PnL, target, stop, and timebox until the exit rule fires.";
  }
  if (snapshot.phase === "postmortem") {
    return "Read the findings and confirm the next constraint change makes sense.";
  }
  return "Start the next cycle and check whether the new strategy slate used the lesson.";
}

export function buildOperatorFlowSnapshot(
  snapshot: OperatorFlowInput,
  generatedAt = Date.now(),
): OperatorFlowSnapshot {
  const strategy = strategyFor(snapshot);
  const decision = snapshot.strategyDecision ?? null;
  const signal = snapshot.signal;
  const cycle = snapshot.activeCycle;
  const execution = snapshot.execution ?? null;
  const postmortem = snapshot.postmortems[0] ?? null;
  const lesson = snapshot.lessons[0] ?? null;
  const noEntryFinal =
    cycle === null &&
    postmortem !== null &&
    (signal?.passed === false || snapshot.cycleHistory[0]?.status === "no_entry");
  const phase = snapshot.phase;
  const selectedStrategyId =
    decision?.selectedStrategyId ?? strategy?.id ?? null;

  const steps: OperatorFlowStep[] = [
    {
      id: "ideate",
      phase: "strategize",
      index: 1,
      label: "Ideate",
      state: stepState({ phase, stepPhase: "strategize", noEntryFinal }),
      headline:
        strategy === null
          ? "No strategy slate yet"
          : `${decision?.hypothesesCount ?? snapshot.strategies.length} hypotheses ranked`,
      detail:
        decision !== null
          ? decision.selectedReason
          : strategy === null
          ? "The bot has not generated strategy candidates yet."
          : `Picked ${strategy.title} from the ${strategy.domain} domain.`,
      operatorCue:
        "This is the coffee-list view: what the bot thinks is worth trying and why.",
      evidence: decisionEvidence(decision, strategy),
      metrics: [
        metric(
          "ideas",
          String(decision?.hypothesesCount ?? snapshot.strategies.length),
        ),
        metric("risk", strategy ? `${strategy.riskBudgetUsd.toFixed(2)} USD` : "-"),
        metric("confidence", strategy ? percent(strategy.confidence) : "-"),
        metric(
          "lessons",
          decision ? String(decision.lessonsConsideredCount) : "0",
          decision?.lessonsConsideredCount ? "positive" : "neutral",
        ),
      ],
    },
    {
      id: "read_signal",
      phase: "signal_watch",
      index: 2,
      label: "Read signal",
      state: stepState({ phase, stepPhase: "signal_watch", noEntryFinal }),
      headline:
        signal === null
          ? "Waiting for a favorable signal"
          : signal.passed
            ? "Signal passed and entry ticket is valid"
            : "Signal failed; no entry",
      detail:
        signal === null
          ? "The bot is scanning the chosen domain and constraint vector."
          : signal.reason,
      operatorCue: "This answers whether the bot bought, waited, or skipped.",
      evidence: signalEvidence(signal),
      metrics: [
        metric("signal", signal === null ? "waiting" : signal.passed ? "pass" : "fail"),
        metric(
          "momentum",
          signal === null ? "-" : `${signal.momentumBps.toFixed(2)} bps`,
          signal?.passed ? "positive" : signal ? "warning" : "neutral",
        ),
        metric(
          "spread",
          signal === null ? "-" : `${signal.spreadBps.toFixed(2)} bps`,
        ),
      ],
    },
    {
      id: "manage_position",
      phase: "monitor_exit",
      index: 3,
      label: "Manage position",
      state: stepState({ phase, stepPhase: "monitor_exit", noEntryFinal }),
      headline:
        cycle === null
          ? noEntryFinal
            ? "Position skipped"
            : "No position yet"
          : cycle.status === "open"
            ? "Watching target, stop, and timebox"
            : `Exited by ${cycle.closeReason ?? "rule"}`,
      detail:
        cycle === null
          ? "No capital is deployed for this cycle."
          : `PnL is ${money(cycle.pnlUsd)} on ${cycle.sizeUsd.toFixed(2)} USD paper notional.`,
      operatorCue: "This is where loss mitigation and upside capture are visible.",
      evidence: [
        ...positionEvidence(cycle),
        ...executionReconciliationEvidence(execution, cycle?.cycleId ?? null),
      ].slice(0, 5),
      metrics: [
        metric(
          "pnl",
          cycle === null ? "0.00 USD" : money(cycle.pnlUsd),
          cycle === null ? "neutral" : cycle.pnlUsd >= 0 ? "positive" : "negative",
        ),
        metric("target", cycle === null ? "-" : price(cycle.targetPrice)),
        metric("stop", cycle === null ? "-" : price(cycle.stopPrice)),
        metric(
          "recon",
          execution?.reconciliation?.readyForPostmortem &&
            execution.reconciliation.cycleId === cycle?.cycleId
            ? "ready"
            : "waiting",
          execution?.reconciliation?.readyForPostmortem &&
            execution.reconciliation.cycleId === cycle?.cycleId
            ? "positive"
            : "neutral",
        ),
      ],
    },
    {
      id: "postmortem",
      phase: "postmortem",
      index: 4,
      label: "Postmortem",
      state: stepState({ phase, stepPhase: "postmortem", noEntryFinal }),
      headline: postmortem?.headline ?? "Review pending",
      detail:
        postmortem?.nextAdjustment ??
        "The bot will review entry quality, exit timing, and risk controls.",
      operatorCue: "This names what the bot could have done better.",
      evidence: postmortemEvidence(postmortem),
      metrics: [
        metric("quality", postmortem?.exitQuality ?? "-"),
        metric("findings", postmortem ? String(postmortem.findings.length) : "0"),
      ],
    },
    {
      id: "learn",
      phase: "learn",
      index: 5,
      label: "Learn",
      state: stepState({ phase, stepPhase: "learn", noEntryFinal }),
      headline: lesson === null ? "Knowledge write pending" : "Lesson written back",
      detail:
        lesson?.summary ??
        "The next strategy slate will use the postmortem as feedback.",
      operatorCue: "This is the feedback loop that changes the next strategize phase.",
      evidence: [...lessonEvidence(lesson), ...sessionEvidence(snapshot)].slice(0, 5),
      metrics: [
        metric("action", lesson?.action.replaceAll("_", " ") ?? "-"),
        metric("repeat", lesson === null ? "waiting" : "ready", lesson ? "positive" : "neutral"),
        metric(
          "session",
          snapshot.sessionRunbook
            ? `${snapshot.sessionRunbook.cycleCount} cycles`
            : "-",
          snapshot.sessionRunbook ? "positive" : "neutral",
        ),
      ],
    },
  ];

  return {
    generatedAt,
    cycleId: cycleIdFor(snapshot),
    phase,
    summary: summaryFor({
      phase,
      cycle,
      signal,
      lesson,
      sessionSummary: snapshot.sessionRunbook?.operatorSummary,
      statusLine: snapshot.statusLine,
      noEntryFinal,
    }),
    nextOperatorAction: nextActionFor(snapshot),
    repeatReady: phase === "learn" && lesson !== null,
    strategySlate: strategySlateFor(
      snapshot.strategies,
      selectedStrategyId,
      snapshot.strategyDecision,
    ),
    steps,
  };
}
