import "./_init";

import Decimal from "decimal.js";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { AutonomySnapshot } from "../autonomy/types";
import type { Side, WhaleSignal } from "../stream/types";

export type AutonomyPhase =
  | "strategize"
  | "signal_watch"
  | "monitor_exit"
  | "postmortem"
  | "learn";

export type StrategyStatus = "candidate" | "selected" | "running" | "learned";

export interface StrategyHypothesis {
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
  status: StrategyStatus;
}

export interface SignalObservation {
  signalId: string;
  strategyId: string;
  symbol: string;
  instrumentId: string;
  side: Side;
  createdAt: number;
  referencePrice: number;
  confidence: number;
  passed: boolean;
  reason: string;
  spreadBps: number;
  momentumBps: number;
  suggestedNotional: number;
}

export interface ActiveContractCycle {
  cycleId: string;
  strategyId: string;
  signalKey: string;
  marketTitle: string;
  outcome: string;
  side: Side;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopPrice: number;
  sizeUsd: number;
  openedAt: number;
  closedAt: number | null;
  exitPrice: number | null;
  pnlUsd: number;
  closeReason: "target" | "stop" | "timebox" | null;
  status: "open" | "closed";
}

export interface CyclePostmortem {
  cycleId: string;
  createdAt: number;
  headline: string;
  exitQuality: "good" | "bad" | "neutral";
  findings: string[];
  nextAdjustment: string;
}

export interface StrategyLesson {
  lessonId: string;
  cycleId: string;
  createdAt: number;
  summary: string;
  appliesTo: string;
  action: string;
}

export interface CycleLedgerEntry {
  cycleId: string;
  createdAt: number;
  status: "closed" | "no_entry";
  marketTitle: string;
  outcome: string;
  side: Side;
  pnlUsd: number;
  closeReason: "target" | "stop" | "timebox" | "no_signal" | null;
  lessonAction: string | null;
  summary: string;
}

export interface AutonomyState {
  phase: AutonomyPhase;
  cycleNumber: number;
  artifactSource: AutonomySnapshot["source"] | null;
  artifactHydrated: boolean;
  strategyDecision: NonNullable<AutonomySnapshot["strategyDecision"]> | null;
  selectedStrategyId: string;
  strategies: StrategyHypothesis[];
  signalObservation: SignalObservation | null;
  activeCycle: ActiveContractCycle | null;
  cycleHistory: CycleLedgerEntry[];
  sessionRunbook: NonNullable<AutonomySnapshot["sessionRunbook"]> | null;
  postmortems: CyclePostmortem[];
  lessons: StrategyLesson[];
  runStartedAt: number | null;
  lastDecisionAt: number | null;
  waitingStartedAt: number | null;
  statusLine: string;
  hydrateFromSnapshot(snapshot: AutonomySnapshot): void;
  generateIdeas(now?: number): void;
  selectStrategy(strategyId: string): void;
  startRun(now?: number): void;
  advance(signals: WhaleSignal[], now?: number): void;
  resetCycle(): void;
}

const STRATEGIES: StrategyHypothesis[] = [
  {
    id: "btcusdt-momentum-continuation",
    rank: 1,
    domain: "crypto",
    title: "BTC/USDT momentum continuation",
    thesis: "Follow a clean short-horizon Kraken Spot impulse only when spread and stop distance both stay tight.",
    entryRule: "Last price up at least 18 bps with spread <= 8 bps",
    exitRule: "+55 bps target, -30 bps stop, 4 tick max hold",
    constraintVector: "momentum with hard stop",
    riskBudgetUsd: 25,
    confidence: 0.68,
    status: "selected",
  },
  {
    id: "btcusdt-spread-mean-reversion",
    rank: 2,
    domain: "crypto",
    title: "BTC/USDT spread mean reversion",
    thesis: "Wait for a fast dip that keeps the book orderly, then paper-buy a small rebound.",
    entryRule: "Last price down at least 25 bps while spread <= 10 bps",
    exitRule: "+40 bps target, -25 bps stop, 3 tick max hold",
    constraintVector: "dip with orderly spread",
    riskBudgetUsd: 19,
    confidence: 0.59,
    status: "candidate",
  },
  {
    id: "eth-relative-strength",
    rank: 3,
    domain: "crypto",
    title: "ETH relative strength check",
    thesis: "Only rotate into ETH when it confirms cleaner impulse than the primary BTC setup.",
    entryRule: "ETH impulse exceeds BTC impulse and spread <= 9 bps",
    exitRule: "+50 bps target, -30 bps stop",
    constraintVector: "cross-symbol confirmation",
    riskBudgetUsd: 16,
    confidence: 0.55,
    status: "candidate",
  },
  {
    id: "volatility-compression-break",
    rank: 4,
    domain: "crypto",
    title: "Volatility compression break",
    thesis: "Do nothing until recent ticks compress, then buy the first expansion with a smaller size.",
    entryRule: "Two quiet ticks followed by +20 bps expansion",
    exitRule: "+35 bps target, -20 bps stop",
    constraintVector: "compressed volatility only",
    riskBudgetUsd: 13,
    confidence: 0.51,
    status: "candidate",
  },
  {
    id: "no-trade-quality-gate",
    rank: 5,
    domain: "crypto",
    title: "No-trade quality gate",
    thesis: "Prefer recording no-entry over forcing a low-quality Kraken Spot position.",
    entryRule: "Reject all setups if spread or impulse misses by more than one threshold",
    exitRule: "No position means no exit; write a constraint lesson",
    constraintVector: "capital preservation",
    riskBudgetUsd: 0,
    confidence: 0.47,
    status: "candidate",
  },
];

const PHASE_LABELS: Record<AutonomyPhase, string> = {
  strategize: "Strategy slate ready",
  signal_watch: "Reading signals",
  monitor_exit: "Position watch",
  postmortem: "Postmortem",
  learn: "Lesson committed",
};

const DEFAULT_STRATEGY = STRATEGIES[0]!;

function cloneStrategies(): StrategyHypothesis[] {
  return STRATEGIES.map((strategy) => ({ ...strategy }));
}

function selectedStrategy(strategies: StrategyHypothesis[], selectedId: string) {
  return (
    strategies.find((strategy) => strategy.id === selectedId) ??
    strategies[0] ??
    DEFAULT_STRATEGY
  );
}

function signalKey(signal: Pick<WhaleSignal, "condition_id" | "asset_id">) {
  return `${signal.condition_id}:${signal.asset_id}`;
}

function signalTitle(signal: WhaleSignal) {
  return signal.title ?? signal.slug ?? signal.event_slug ?? signal.instrument_id;
}

function decimalNumber(value: string | number) {
  return new Decimal(value).toNumber();
}

function clampSpotPrice(value: number) {
  return Math.max(0.0001, value);
}

function pickSignalForStrategy(signals: WhaleSignal[], strategy: StrategyHypothesis) {
  const domainMatches = signals.filter((signal) => {
    const haystack = `${signal.title ?? ""} ${signal.slug ?? ""} ${signal.event_slug ?? ""}`.toLowerCase();
    return haystack.includes(strategy.domain);
  });

  return (domainMatches.length > 0 ? domainMatches : signals)[0] ?? null;
}

function signalObservationFromWhaleSignal(
  strategy: StrategyHypothesis,
  signal: WhaleSignal,
  now: number,
): SignalObservation {
  return {
    signalId: signalKey(signal),
    strategyId: strategy.id,
    symbol: strategy.title.split(" ")[0] ?? "BTC/USDT",
    instrumentId: signal.instrument_id,
    side: signal.side,
    createdAt: now,
    referencePrice: clampSpotPrice(decimalNumber(signal.reference_price)),
    confidence: 0.72,
    passed: true,
    reason: "Signal cleared the selected strategy's entry gate.",
    spreadBps: 6.4,
    momentumBps: 22.8,
    suggestedNotional: decimalNumber(signal.suggested_notional),
  };
}

function enterCycle(
  strategy: StrategyHypothesis,
  signal: WhaleSignal,
  now: number,
  cycleNumber: number,
): ActiveContractCycle {
  const entryPrice = clampSpotPrice(decimalNumber(signal.reference_price));
  const sizeUsd = Math.min(
    strategy.riskBudgetUsd,
    decimalNumber(signal.suggested_notional),
  );
  const targetMove = strategy.id.includes("mean-reversion") ? 0.004 : 0.0055;
  const stopMove = strategy.id.includes("mean-reversion") ? 0.0025 : 0.003;
  const targetPrice =
    signal.side === "BUY"
      ? clampSpotPrice(entryPrice * (1 + targetMove))
      : clampSpotPrice(entryPrice * (1 - targetMove));
  const stopPrice =
    signal.side === "BUY"
      ? clampSpotPrice(entryPrice * (1 - stopMove))
      : clampSpotPrice(entryPrice * (1 + stopMove));

  return {
    cycleId: `cycle-${cycleNumber.toString().padStart(3, "0")}`,
    strategyId: strategy.id,
    signalKey: signalKey(signal),
    marketTitle: signalTitle(signal),
    outcome: signal.outcome ?? "Outcome unavailable",
    side: signal.side,
    entryPrice,
    currentPrice: entryPrice,
    targetPrice,
    stopPrice,
    sizeUsd,
    openedAt: now,
    closedAt: null,
    exitPrice: null,
    pnlUsd: 0,
    closeReason: null,
    status: "open",
  };
}

function cycleId(cycleNumber: number) {
  return `cycle-${cycleNumber.toString().padStart(3, "0")}`;
}

function markCycle(cycle: ActiveContractCycle, now: number): ActiveContractCycle {
  const elapsedSecs = Math.max(0, (now - cycle.openedAt) / 1_000);
  const favorableMove = Math.abs(cycle.targetPrice - cycle.entryPrice);
  const progress = Math.min(1, elapsedSecs / 14);
  const directionalMove = favorableMove * progress;
  const currentPrice =
    cycle.side === "BUY"
      ? clampSpotPrice(cycle.entryPrice + directionalMove)
      : clampSpotPrice(cycle.entryPrice - directionalMove);
  const pnlDirection =
    cycle.side === "BUY"
      ? currentPrice - cycle.entryPrice
      : cycle.entryPrice - currentPrice;
  const pnlUsd = (pnlDirection / Math.max(cycle.entryPrice, 0.01)) * cycle.sizeUsd;

  let closeReason: ActiveContractCycle["closeReason"] = null;
  if (cycle.side === "BUY" && currentPrice >= cycle.targetPrice) {
    closeReason = "target";
  } else if (cycle.side === "SELL" && currentPrice <= cycle.targetPrice) {
    closeReason = "target";
  } else if (elapsedSecs >= 20) {
    closeReason = "timebox";
  }

  return {
    ...cycle,
    currentPrice: Number(currentPrice.toFixed(4)),
    pnlUsd: Number(pnlUsd.toFixed(2)),
    ...(closeReason
      ? {
          status: "closed" as const,
          closedAt: now,
          exitPrice: Number(currentPrice.toFixed(4)),
          closeReason,
        }
      : {}),
  };
}

function buildNoEntryPostmortem(
  strategy: StrategyHypothesis,
  now: number,
  cycleNumber: number,
): CyclePostmortem {
  return {
    cycleId: cycleId(cycleNumber),
    createdAt: now,
    headline: "No entry preserved capital because the signal gate never cleared.",
    exitQuality: "neutral",
    findings: [
      `${strategy.title} stayed idle because the selected entry constraints were not met.`,
      `Risk budget stayed at ${strategy.riskBudgetUsd.toFixed(2)} USD; no paper position opened.`,
      "The next run can loosen one threshold, but not both spread and momentum at once.",
    ],
    nextAdjustment:
      "Loosen exactly one entry constraint next cycle, then keep watching for cleaner confirmation.",
  };
}

function buildPostmortem(cycle: ActiveContractCycle, now: number): CyclePostmortem {
  const positive = cycle.pnlUsd > 0;
  const exitQuality =
    cycle.closeReason === "target" ? "good" : positive ? "neutral" : "bad";

  return {
    cycleId: cycle.cycleId,
    createdAt: now,
    headline:
      cycle.closeReason === "target"
        ? "Target exit captured the planned edge."
        : "Timebox exit protected the cycle from idle exposure.",
    exitQuality,
    findings: [
      `${cycle.side} ${cycle.outcome} entered at ${cycle.entryPrice.toFixed(3)} and exited at ${(cycle.exitPrice ?? cycle.currentPrice).toFixed(3)}.`,
      `Risk budget stayed capped at ${cycle.sizeUsd.toFixed(2)} USD.`,
      positive
        ? "The exit threshold was useful for locking the move."
        : "The bot should demand stronger confirmation before repeating this token.",
    ],
    nextAdjustment: positive
      ? "Keep the strategy active; do not auto-increase size until it repeats."
      : "Tighten entry quality and cool down this token/side before reuse.",
  };
}

function buildLesson(
  cycle: ActiveContractCycle | null,
  postmortem: CyclePostmortem,
  now: number,
): StrategyLesson {
  const positive = (cycle?.pnlUsd ?? 0) > 0;
  const noEntry = cycle === null;

  return {
    lessonId: `lesson-${postmortem.cycleId}`,
    cycleId: postmortem.cycleId,
    createdAt: now,
    summary: noEntry
      ? "No-entry cycle recorded as a controlled constraint adjustment."
      : positive
        ? "Target-hit setup recorded as positive evidence."
        : "Loss or idle close recorded as a cooldown rule.",
    appliesTo:
      cycle === null
        ? `${postmortem.cycleId} / no-entry / selected strategy`
        : `${cycle.strategyId} / ${cycle.side} / ${cycle.outcome}`,
    action: noEntry
      ? "Loosen exactly one entry gate before the next signal watch."
      : positive
        ? "Keep constraints unchanged for the next cycle."
        : "Skip this token/side unless a later signal is materially stronger.",
  };
}

function buildCycleLedgerEntry(
  cycle: ActiveContractCycle | null,
  postmortem: CyclePostmortem,
  lesson: StrategyLesson,
): CycleLedgerEntry {
  if (cycle === null) {
    return {
      cycleId: postmortem.cycleId,
      createdAt: postmortem.createdAt,
      status: "no_entry",
      marketTitle: "Kraken Spot signal watch",
      outcome: "No position opened",
      side: "BUY",
      pnlUsd: 0,
      closeReason: "no_signal",
      lessonAction: lesson.action,
      summary: postmortem.nextAdjustment,
    };
  }

  return {
    cycleId: cycle.cycleId,
    createdAt: cycle.closedAt ?? postmortem.createdAt,
    status: "closed",
    marketTitle: cycle.marketTitle,
    outcome: cycle.outcome,
    side: cycle.side,
    pnlUsd: cycle.pnlUsd,
    closeReason: cycle.closeReason,
    lessonAction: lesson.action,
    summary: postmortem.nextAdjustment,
  };
}

export const useAutonomyStore = create<AutonomyState>()(
  immer((set, get) => ({
    phase: "strategize",
    cycleNumber: 1,
    artifactSource: null,
    artifactHydrated: false,
    strategyDecision: null,
    selectedStrategyId: "btcusdt-momentum-continuation",
    strategies: cloneStrategies(),
    signalObservation: null,
    activeCycle: null,
    cycleHistory: [],
    sessionRunbook: null,
    postmortems: [],
    lessons: [],
    runStartedAt: null,
    lastDecisionAt: null,
    waitingStartedAt: null,
    statusLine: PHASE_LABELS.strategize,
    hydrateFromSnapshot: (snapshot) => {
      set((state) => {
        state.phase = snapshot.phase;
        state.cycleNumber = snapshot.cycleNumber;
        state.artifactSource = snapshot.source;
        state.artifactHydrated = snapshot.source.kind === "artifact";
        state.strategyDecision = snapshot.strategyDecision ?? null;
        state.activeCycle = snapshot.activeCycle;
        state.cycleHistory = snapshot.cycleHistory;
        state.sessionRunbook = snapshot.sessionRunbook ?? null;
        state.postmortems = snapshot.postmortems;
        state.lessons = snapshot.lessons;
        state.lastDecisionAt = snapshot.source.loadedAt;
        state.statusLine = snapshot.statusLine;
        if (snapshot.strategies.length > 0) {
          state.strategies = snapshot.strategies;
          state.selectedStrategyId = snapshot.strategies[0]!.id;
        }
        state.signalObservation = snapshot.signal;
        state.strategies.forEach((strategy) => {
          if (strategy.id !== state.selectedStrategyId) {
            strategy.status = "candidate";
            return;
          }
          strategy.status =
            snapshot.phase === "learn"
              ? "learned"
              : snapshot.phase === "monitor_exit"
                ? "running"
                : "selected";
        });
      });
    },
    generateIdeas: (now = Date.now()) => {
      set((state) => {
        state.phase = "strategize";
        state.activeCycle = null;
        state.runStartedAt = null;
        state.waitingStartedAt = null;
        state.lastDecisionAt = now;
        state.signalObservation = null;
        state.statusLine = "Five Kraken Spot hypotheses ranked for the next run.";
        state.artifactHydrated = false;
        state.strategyDecision = null;
        state.strategies = cloneStrategies();
        state.selectedStrategyId = "btcusdt-momentum-continuation";
      });
    },
    selectStrategy: (strategyId) => {
      set((state) => {
        state.selectedStrategyId = strategyId;
        state.strategies.forEach((strategy) => {
          strategy.status =
            strategy.id === strategyId ? "selected" : "candidate";
        });
      });
    },
    startRun: (now = Date.now()) => {
      set((state) => {
        state.phase = "signal_watch";
        state.runStartedAt = now;
        state.waitingStartedAt = now;
        state.lastDecisionAt = now;
        state.signalObservation = null;
        state.activeCycle = null;
        state.statusLine = "Scanning for a favorable Kraken Spot signal.";
        state.strategies.forEach((strategy) => {
          strategy.status =
            strategy.id === state.selectedStrategyId ? "running" : "candidate";
        });
      });
    },
    advance: (signals, now = Date.now()) => {
      const current = get();
      if (current.phase === "signal_watch") {
        const strategy = selectedStrategy(current.strategies, current.selectedStrategyId);
        const signal = pickSignalForStrategy(signals, strategy);
        set((state) => {
          state.lastDecisionAt = now;
          if (signal === null) {
            const waited = Math.trunc(
              (now - (state.waitingStartedAt ?? now)) / 1_000,
            );
            if (waited >= 20) {
              const postmortem = buildNoEntryPostmortem(
                strategy,
                now,
                state.cycleNumber,
              );
              state.phase = "postmortem";
              state.postmortems.unshift(postmortem);
              state.statusLine =
                "No entry recorded; postmortem is checking which constraint to loosen.";
              return;
            }

            state.statusLine = "Waiting for spot flow to meet the selected strategy.";
            return;
          }

          state.signalObservation = signalObservationFromWhaleSignal(
            strategy,
            signal,
            now,
          );
          state.activeCycle = enterCycle(
            strategy,
            signal,
            now,
            state.cycleNumber,
          );
          state.phase = "monitor_exit";
          state.statusLine = "Position entered; monitoring target, stop, and timebox.";
        });
        return;
      }

      if (current.phase === "monitor_exit" && current.activeCycle) {
        const marked = markCycle(current.activeCycle, now);
        set((state) => {
          state.activeCycle = marked;
          state.lastDecisionAt = now;
          state.statusLine =
            marked.status === "closed"
              ? "Exit fired; preparing postmortem."
              : "Monitoring price against target, stop, and timebox.";
          if (marked.status === "closed") {
            state.phase = "postmortem";
            state.postmortems.unshift(buildPostmortem(marked, now));
          }
        });
        return;
      }

      if (current.phase === "postmortem" && current.activeCycle) {
        const latestPostmortem = current.postmortems[0];
        if (!latestPostmortem || now - latestPostmortem.createdAt < 4_000) {
          return;
        }
        const lesson = buildLesson(current.activeCycle, latestPostmortem, now);
        set((state) => {
          state.phase = "learn";
          state.lastDecisionAt = now;
          state.statusLine = "Postmortem converted into a reusable strategy lesson.";
          state.lessons.unshift(lesson);
          if (
            !state.cycleHistory.some(
              (cycle) => cycle.cycleId === latestPostmortem.cycleId,
            )
          ) {
            state.cycleHistory.unshift(
              buildCycleLedgerEntry(current.activeCycle, latestPostmortem, lesson),
            );
          }
          state.strategies.forEach((strategy) => {
            strategy.status =
              strategy.id === state.selectedStrategyId ? "learned" : strategy.status;
          });
        });
        return;
      }

      if (current.phase === "postmortem" && current.activeCycle === null) {
        const latestPostmortem = current.postmortems[0];
        if (!latestPostmortem || now - latestPostmortem.createdAt < 4_000) {
          return;
        }
        const lesson = buildLesson(null, latestPostmortem, now);
        set((state) => {
          state.phase = "learn";
          state.lastDecisionAt = now;
          state.statusLine = "No-entry postmortem converted into the next constraint change.";
          state.lessons.unshift(lesson);
          if (
            !state.cycleHistory.some(
              (cycle) => cycle.cycleId === latestPostmortem.cycleId,
            )
          ) {
            state.cycleHistory.unshift(
              buildCycleLedgerEntry(null, latestPostmortem, lesson),
            );
          }
          state.strategies.forEach((strategy) => {
            strategy.status =
              strategy.id === state.selectedStrategyId ? "learned" : strategy.status;
          });
        });
      }
    },
    resetCycle: () => {
      set((state) => {
        state.phase = "strategize";
        state.cycleNumber += 1;
        state.activeCycle = null;
        state.signalObservation = null;
        state.runStartedAt = null;
        state.waitingStartedAt = null;
        state.lastDecisionAt = Date.now();
        state.statusLine = PHASE_LABELS.strategize;
        state.strategies.forEach((strategy) => {
          strategy.status =
            strategy.id === state.selectedStrategyId ? "selected" : "candidate";
        });
      });
    },
  })),
);

export const PHASES: readonly { id: AutonomyPhase; label: string }[] = [
  { id: "strategize", label: "Strategize" },
  { id: "signal_watch", label: "Read signals" },
  { id: "monitor_exit", label: "Watch position" },
  { id: "postmortem", label: "Postmortem" },
  { id: "learn", label: "Learn" },
] as const;
