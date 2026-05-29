"use client";

import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Database,
  Play,
  RefreshCcw,
  ScrollText,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MonoNumber } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  buildOperatorFlowSnapshot,
  type OperatorFlowMetric,
  type OperatorFlowSnapshot,
  type OperatorFlowStrategy,
  type OperatorFlowStep,
} from "@/lib/autonomy/operator-flow";
import type { SessionRunbook } from "@/lib/autonomy/types";
import { formatPrice, formatTimestampShort } from "@/lib/format";
import {
  PHASES,
  useAutonomyStore,
  useSignals,
  type AutonomyPhase,
  type CyclePostmortem,
  type SignalObservation,
  type StrategyHypothesis,
  type StrategyLesson,
  type ActiveContractCycle,
} from "@/lib/stores";
import { cn } from "@/lib/utils";

const phaseOrder = PHASES.map((phase) => phase.id);
const RUN_SCENARIOS = [
  {
    id: "target",
    label: "Target",
    status: "Rehearsing a clean target-hit exit.",
  },
  {
    id: "stop",
    label: "Stop",
    status: "Rehearsing a protective stop exit.",
  },
  {
    id: "timebox",
    label: "Timebox",
    status: "Rehearsing a stale-position timebox exit.",
  },
  {
    id: "no-entry",
    label: "No entry",
    status: "Rehearsing a constraint miss and lesson writeback.",
  },
] as const;
const LOOP_PLAYBOOK: RunScenario[] = ["target", "no-entry", "stop", "timebox"];
const fallbackStrategy = {
  id: "fallback",
  rank: 0,
  domain: "none",
  title: "No strategy selected",
  thesis: "Strategy slate has not been generated.",
  entryRule: "No entry rule",
  exitRule: "No exit rule",
  constraintVector: "none",
  riskBudgetUsd: 0,
  confidence: 0,
  status: "candidate" as const,
} satisfies StrategyHypothesis;

type RunScenario = (typeof RUN_SCENARIOS)[number]["id"];

function isRunScenario(value: string | null | undefined): value is RunScenario {
  return RUN_SCENARIOS.some((scenario) => scenario.id === value);
}

function loopSequence(start: RunScenario): RunScenario[] {
  return [
    start,
    ...LOOP_PLAYBOOK.filter((scenario) => scenario !== start),
  ];
}

function phaseIndex(phase: AutonomyPhase) {
  return phaseOrder.indexOf(phase);
}

function phaseTone(phase: AutonomyPhase, current: AutonomyPhase) {
  const currentIndex = phaseIndex(current);
  const thisIndex = phaseIndex(phase);

  if (thisIndex < currentIndex) {
    return "complete";
  }

  if (thisIndex === currentIndex) {
    return "active";
  }

  return "pending";
}

function statusClass(status: StrategyHypothesis["status"]) {
  switch (status) {
    case "running":
      return "border-amber/60 bg-amber/10 text-amber";
    case "selected":
      return "border-teal/50 bg-teal/10 text-teal";
    case "learned":
      return "border-sand/50 bg-sand/10 text-sand";
    default:
      return "border-whisper bg-plane text-muted-steel";
  }
}

function PhaseRail({ phase }: { phase: AutonomyPhase }) {
  return (
    <div className="grid gap-2 lg:grid-cols-5">
      {PHASES.map((item, index) => {
        const tone = phaseTone(item.id, phase);
        const Icon = tone === "complete" ? CheckCircle2 : Circle;

        return (
          <div
            key={item.id}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-[8px] border px-3 py-2",
              tone === "active" && "border-amber/50 bg-amber/10 text-bone",
              tone === "complete" && "border-teal/40 bg-teal/10 text-teal",
              tone === "pending" && "border-whisper bg-edge/70 text-muted-steel",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span data-mono className="text-2xs text-muted-steel">
              {index + 1}
            </span>
            <span className="truncate text-xs font-medium">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

type StoryState = "pending" | "active" | "complete" | "blocked";

function storyTone(state: StoryState) {
  switch (state) {
    case "active":
      return "border-amber/50 bg-amber/10";
    case "complete":
      return "border-teal/40 bg-teal/10";
    case "blocked":
      return "border-sand/50 bg-sand/10";
    default:
      return "border-whisper bg-edge/70";
  }
}

function storyStateLabel(state: StoryState) {
  switch (state) {
    case "active":
      return "now";
    case "complete":
      return "done";
    case "blocked":
      return "no entry";
    default:
      return "next";
  }
}

function flowStateTone(state: OperatorFlowStep["state"]) {
  switch (state) {
    case "active":
      return "border-amber/50 bg-amber/10 text-amber";
    case "complete":
      return "border-teal/40 bg-teal/10 text-teal";
    case "blocked":
      return "border-sand/50 bg-sand/10 text-sand";
    default:
      return "border-whisper bg-plane text-muted-steel";
  }
}

function metricTone(tone: OperatorFlowMetric["tone"]) {
  switch (tone) {
    case "positive":
      return "text-teal";
    case "negative":
      return "text-rust";
    case "warning":
      return "text-sand";
    default:
      return "text-bone";
  }
}

const flowIcons: Record<OperatorFlowStep["id"], typeof BrainCircuit> = {
  ideate: BrainCircuit,
  read_signal: Search,
  manage_position: Target,
  postmortem: ScrollText,
  learn: Database,
};

function signalSummary(signal: SignalObservation | null, statusLine: string) {
  if (signal === null) {
    return statusLine;
  }

  return `${signal.reason} Momentum ${signal.momentumBps.toFixed(2)} bps, spread ${signal.spreadBps.toFixed(2)} bps.`;
}

function positionSummary(cycle: ActiveContractCycle | null) {
  if (cycle === null) {
    return "No paper position has been opened for this cycle.";
  }

  if (cycle.status === "open") {
    return `${cycle.side} ${cycle.outcome} opened at ${cycle.entryPrice.toFixed(3)}; target ${cycle.targetPrice.toFixed(3)}, stop ${cycle.stopPrice.toFixed(3)}.`;
  }

  return `${cycle.side} ${cycle.outcome} exited by ${cycle.closeReason ?? "rule"} at ${(cycle.exitPrice ?? cycle.currentPrice).toFixed(3)} for ${cycle.pnlUsd.toFixed(2)} USD.`;
}

function postmortemAlternative(
  postmortem: CyclePostmortem | null,
  cycle: ActiveContractCycle | null,
) {
  if (postmortem === null) {
    return "After a close or no-entry, this will name what the bot could have done differently.";
  }

  if (cycle === null) {
    return "Could loosen momentum or spread next time, but only one threshold at a time.";
  }

  if (cycle.closeReason === "target") {
    return "Could trail for more upside, but the current lesson preserves the proven target first.";
  }

  if (cycle.closeReason === "stop") {
    return "Could demand stronger confirmation before buying this symbol again.";
  }

  return "Could exit stale exposure earlier if the mark stops progressing toward target.";
}

function StoryCard({
  icon: Icon,
  index,
  label,
  state,
  headline,
  detail,
}: {
  icon: typeof BrainCircuit;
  index: number;
  label: string;
  state: StoryState;
  headline: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[8px] border px-3 py-3",
        storyTone(state),
      )}
    >
      <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-amber" aria-hidden="true" />
          <span data-mono className="text-2xs text-muted-steel">
            {index}
          </span>
          <span className="truncate text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
            {label}
          </span>
        </div>
        <span
          data-mono
          className="shrink-0 rounded-full border border-whisper bg-plane px-2 py-0.5 text-2xs uppercase text-muted-steel"
        >
          {storyStateLabel(state)}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-bone">{headline}</h3>
      <p className="mt-2 line-clamp-3 text-xs text-steel">{detail}</p>
    </div>
  );
}

function OperatorTimelinePanel({ flow }: { flow: OperatorFlowSnapshot }) {
  return (
    <div className="rounded-[8px] border border-whisper bg-edge/50 p-3">
      <div className="mb-3 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            Operator timeline
          </div>
          <p className="mt-1 text-sm text-bone">{flow.summary}</p>
        </div>
        <div className="shrink-0 rounded-[8px] border border-whisper bg-plane px-3 py-2 text-2xs text-steel md:max-w-[320px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-muted-steel">
            Next
          </span>
          <span className="ml-2">{flow.nextOperatorAction}</span>
        </div>
      </div>

      <div className="grid gap-2">
        {flow.steps.map((step) => {
          const Icon = flowIcons[step.id];

          return (
            <div
              key={step.id}
              className="grid min-w-0 gap-3 rounded-[8px] border border-whisper bg-plane px-3 py-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(220px,0.7fr)]"
            >
              <div className="min-w-0">
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  <Icon className="size-3.5 shrink-0 text-amber" aria-hidden="true" />
                  <span data-mono className="text-2xs text-muted-steel">
                    {step.index}
                  </span>
                  <span className="truncate text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                    {step.label}
                  </span>
                  <span
                    data-mono
                    className={cn(
                      "ml-auto shrink-0 rounded-full border px-2 py-0.5 text-2xs uppercase",
                      flowStateTone(step.state),
                    )}
                  >
                    {step.state}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-bone">
                  {step.headline}
                </h3>
                <p className="mt-1 text-xs text-steel">{step.detail}</p>
              </div>

              <div className="min-w-0 rounded-[8px] border border-whisper bg-edge px-3 py-2">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                  Evidence
                </div>
                <ul className="space-y-1">
                  {step.evidence.slice(0, 5).map((item) => (
                    <li
                      key={item}
                      className="break-words text-2xs text-steel [overflow-wrap:anywhere]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-2xs text-muted-steel">
                  {step.operatorCue}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {step.metrics.slice(0, 4).map((item) => (
                    <div
                      key={`${step.id}-${item.label}`}
                      className="rounded-[8px] border border-whisper bg-edge px-2 py-2"
                    >
                      <div className="text-2xs uppercase tracking-[0.14em] text-muted-steel">
                        {item.label}
                      </div>
                      <div
                        data-mono
                        className={cn("mt-1 text-2xs", metricTone(item.tone))}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OperatorBriefPanel({
  flow,
  session,
}: {
  flow: OperatorFlowSnapshot;
  session: SessionRunbook | null;
}) {
  const currentStep =
    flow.steps.find((step) => step.state === "active") ??
    flow.steps.findLast((step) => step.state === "complete") ??
    flow.steps[0];
  const completedSteps = flow.steps.filter(
    (step) => step.state === "complete" || step.state === "blocked",
  ).length;
  const selectedStrategy =
    flow.strategySlate.find((strategy) => strategy.selected) ??
    flow.strategySlate[0] ??
    null;

  return (
    <div className="grid gap-3 rounded-[8px] border border-amber/30 bg-amber/10 px-3 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-amber">
            Run brief
          </span>
          <span
            data-mono
            className="rounded-full border border-amber/40 bg-plane px-2 py-0.5 text-2xs uppercase text-muted-steel"
          >
            {flow.cycleId}
          </span>
          <span
            data-mono
            className="rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-2xs uppercase text-teal"
          >
            {currentStep?.label ?? flow.phase}
          </span>
        </div>
        <p className="text-sm font-medium text-bone">{flow.summary}</p>
        <p className="mt-1 text-xs text-steel">
          {currentStep?.headline ?? "Operator flow is loading."}
        </p>
        <StrategyVectorScorecard strategy={selectedStrategy} />
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <Metric label="progress" value={`${completedSteps}/5`} />
        <Metric
          label="repeat"
          value={flow.repeatReady ? "ready" : "waiting"}
        />
        <div className="min-w-0 overflow-hidden rounded-[8px] border border-whisper bg-plane px-3 py-2">
          <div className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
            next
          </div>
          <div className="mt-1 max-w-full whitespace-normal break-words text-xs leading-relaxed text-bone [overflow-wrap:anywhere]">
            {session?.nextCycleScenario
              ? `${session.nextCycleScenario}: ${flow.nextOperatorAction}`
              : flow.nextOperatorAction}
          </div>
        </div>
      </div>
    </div>
  );
}

function StrategyVectorScorecard({
  strategy,
}: {
  strategy: OperatorFlowStrategy | null;
}) {
  const vectorScores = strategy?.vectorScores ?? [];

  if (vectorScores.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0">
      <div className="mb-1 text-2xs uppercase tracking-[0.16em] text-muted-steel">
        Strategy vectors
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-3">
        {vectorScores.slice(0, 6).map((vector) => (
          <div
            key={vector.id}
            className="flex min-w-0 items-baseline justify-between gap-2 border-b border-whisper/60 py-1"
            title={vector.rationale}
          >
            <span className="min-w-0 truncate text-2xs uppercase tracking-[0.12em] text-muted-steel">
              {shortVectorLabel(vector.label)}
            </span>
            <span data-mono className="shrink-0 text-xs text-bone">
              {vector.score.toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CycleStoryPanel({
  phase,
  strategy,
  ideaCount,
  signal,
  cycle,
  postmortem,
  lesson,
  statusLine,
}: {
  phase: AutonomyPhase;
  strategy: StrategyHypothesis;
  ideaCount: number;
  signal: SignalObservation | null;
  cycle: ActiveContractCycle | null;
  postmortem: CyclePostmortem | null;
  lesson: StrategyLesson | null;
  statusLine: string;
}) {
  const currentIndex = phaseIndex(phase);
  const noEntryComplete =
    cycle === null &&
    (phase === "postmortem" || phase === "learn") &&
    postmortem !== null;

  const stageState = (index: number): StoryState => {
    if (index < currentIndex) {
      return "complete";
    }
    if (index === currentIndex) {
      return "active";
    }
    return "pending";
  };

  return (
    <div className="grid gap-3 xl:grid-cols-5">
      <StoryCard
        icon={BrainCircuit}
        index={1}
        label="Ideate"
        state={stageState(0)}
        headline={`${ideaCount} ranked strategy hypotheses`}
        detail={`Selected: ${strategy.title}. Vector: ${strategy.constraintVector}; risk ${strategy.riskBudgetUsd.toFixed(0)} USD.`}
      />
      <StoryCard
        icon={Search}
        index={2}
        label="Read"
        state={noEntryComplete ? "blocked" : stageState(1)}
        headline={
          signal?.passed
            ? "Favorable signal found"
            : noEntryComplete
              ? "No qualifying signal"
              : "Watching for entry"
        }
        detail={signalSummary(signal, statusLine)}
      />
      <StoryCard
        icon={Target}
        index={3}
        label="Enter/exit"
        state={noEntryComplete ? "blocked" : stageState(2)}
        headline={
          cycle === null
            ? noEntryComplete
              ? "Skipped the position"
              : "No position yet"
            : cycle.status === "open"
              ? "Position is open"
              : "Position closed"
        }
        detail={positionSummary(cycle)}
      />
      <StoryCard
        icon={ScrollText}
        index={4}
        label="Review"
        state={stageState(3)}
        headline={postmortem?.headline ?? "Postmortem pending"}
        detail={postmortemAlternative(postmortem, cycle)}
      />
      <StoryCard
        icon={Database}
        index={5}
        label="Learn"
        state={stageState(4)}
        headline={lesson ? "Lesson written back" : "Knowledge write pending"}
        detail={
          lesson
            ? `${lesson.summary} Next action: ${lessonCopy(lesson.action)}`
            : "The next cycle will reuse the postmortem as a constraint change or reinforcement."
        }
      />
    </div>
  );
}

function StrategyRow({
  strategy,
  flowStrategy,
  selected,
  onSelect,
}: {
  strategy: StrategyHypothesis;
  flowStrategy: OperatorFlowStrategy | null;
  selected: boolean;
  onSelect(): void;
}) {
  const vectorScores = flowStrategy?.vectorScores ?? [];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-[8px] border px-3 py-3 text-left transition-colors",
        selected
          ? "border-amber/50 bg-amber/10"
          : "border-whisper bg-edge/70 hover:bg-halo",
      )}
    >
      <div
        data-mono
        className="flex size-7 items-center justify-center rounded-full border border-whisper bg-plane text-2xs text-muted-steel"
      >
        {strategy.rank}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-bone">
            {strategy.title}
          </h3>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.12em]",
              statusClass(strategy.status),
            )}
          >
            {strategy.status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-steel">
          {strategy.thesis}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-steel">
          <span data-mono>{strategy.domain}</span>
          <span>{strategy.constraintVector}</span>
          <span>{strategy.entryRule}</span>
        </div>
        {vectorScores.length > 0 && (
          <div className="mt-3 flex min-w-0 flex-wrap gap-x-2 gap-y-1 border-t border-whisper/70 pt-2">
            {vectorScores.slice(0, 6).map((vector) => (
              <span
                key={vector.id}
                className="inline-flex min-w-0 items-baseline gap-1 text-2xs"
                title={vector.rationale}
              >
                <span className="uppercase tracking-[0.08em] text-muted-steel">
                  {shortVectorCode(vector.id, vector.label)}
                </span>
                <span data-mono className="text-bone">
                  {vector.score.toFixed(0)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <MonoNumber
          value={strategy.confidence}
          size="xs"
          unit="%"
          precision={0}
          variant={selected ? "accent" : "muted"}
        />
        <MonoNumber
          value={strategy.riskBudgetUsd}
          size="2xs"
          unit="USD"
          precision={0}
          variant="muted"
        />
      </div>
    </button>
  );
}

function ContractMonitor() {
  const cycle = useAutonomyStore((state) => state.activeCycle);
  const phase = useAutonomyStore((state) => state.phase);

  if (cycle === null) {
    const copy =
      phase === "postmortem" || phase === "learn"
        ? "No entry recorded. Capital stayed out; review the postmortem and loosen exactly one gate."
        : "No position entered in the current cycle.";

    return (
      <div className="flex min-h-[172px] items-center justify-center rounded-[8px] border border-dashed border-whisper bg-edge/50 px-4 py-5 text-center text-sm text-muted-steel">
        {copy}
      </div>
    );
  }

  const positive = cycle.pnlUsd >= 0;
  const targetDistance = Math.abs(cycle.targetPrice - cycle.entryPrice);
  const currentDistance = Math.abs(cycle.currentPrice - cycle.entryPrice);
  const progress = Math.min(
    100,
    (currentDistance / Math.max(targetDistance, 0.001)) * 100,
  );
  const priceLabel = cycle.status === "closed" ? "exit" : "mark";

  return (
    <div className="rounded-[8px] border border-whisper bg-edge px-4 py-4">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            {cycle.status === "closed" ? "Closed Position" : "Active Position"}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold text-bone">
            {cycle.marketTitle}
          </h3>
          <p className="mt-1 text-xs text-steel">{cycle.outcome}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            data-mono
            className={cn(
              "rounded-full border px-2 py-1 text-2xs font-semibold",
              cycle.side === "BUY"
                ? "border-teal text-teal"
                : "border-rust text-rust",
            )}
          >
            {cycle.side}
          </span>
          {cycle.closeReason && (
            <span
              data-mono
              className="rounded-full border border-whisper bg-plane px-2 py-0.5 text-2xs font-medium uppercase text-muted-steel"
            >
              {cycle.closeReason}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="entry" value={formatPrice(cycle.entryPrice, 3)} />
        <Metric label={priceLabel} value={formatPrice(cycle.currentPrice, 3)} />
        <Metric label="target" value={formatPrice(cycle.targetPrice, 3)} />
        <Metric label="stop" value={formatPrice(cycle.stopPrice, 3)} />
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-plane">
        <div
          className={cn("h-full rounded-full", positive ? "bg-teal" : "bg-rust")}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
          cycle pnl
        </span>
        <MonoNumber
          value={cycle.pnlUsd}
          size="sm"
          unit="USD"
          precision={2}
          variant={positive ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}

function SignalDecisionPanel({
  signal,
  selectedStrategy,
  statusLine,
}: {
  signal: SignalObservation | null;
  selectedStrategy: StrategyHypothesis;
  statusLine: string;
}) {
  return (
    <div className="rounded-[8px] border border-whisper bg-edge px-4 py-4">
      <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
        <Activity className="size-3.5" aria-hidden="true" />
        Run State
      </div>
      <p className="text-sm text-bone">{statusLine}</p>
      <div className="mt-3 text-2xs uppercase tracking-[0.16em] text-muted-steel">
        {selectedStrategy.entryRule}
      </div>
      <div className="mt-1 text-xs text-steel">
        {selectedStrategy.exitRule}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric
          label="signal"
          value={signal === null ? "waiting" : signal.passed ? "passed" : "rejected"}
        />
        <Metric
          label="momentum"
          value={signal === null ? "-" : `${signal.momentumBps.toFixed(2)} bps`}
        />
        <Metric
          label="spread"
          value={signal === null ? "-" : `${signal.spreadBps.toFixed(2)} bps`}
        />
        <Metric
          label="confidence"
          value={signal === null ? "-" : `${(signal.confidence * 100).toFixed(0)}%`}
        />
      </div>
      {signal && (
        <p className="mt-3 text-xs text-steel">
          {signal.reason} Suggested notional:{" "}
          <span data-mono>{signal.suggestedNotional.toFixed(2)} USD</span>.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-whisper bg-plane px-3 py-2">
      <div className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
        {label}
      </div>
      <div data-mono className="mt-1 text-sm font-medium text-bone">
        {value}
      </div>
    </div>
  );
}

function PostmortemPanel() {
  const postmortem = useAutonomyStore((state) => state.postmortems[0] ?? null);
  const lesson = useAutonomyStore((state) => state.lessons[0] ?? null);

  if (postmortem === null) {
    return (
      <div className="rounded-[8px] border border-whisper bg-edge px-4 py-4">
        <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
          <ScrollText className="size-3.5" aria-hidden="true" />
          Postmortem
        </div>
        <p className="text-sm text-muted-steel">
          Waiting for a completed position cycle.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-whisper bg-edge px-4 py-4">
      <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
        <ScrollText className="size-3.5" aria-hidden="true" />
        Postmortem
      </div>
      <h3 className="text-sm font-semibold text-bone">{postmortem.headline}</h3>
      <ul className="mt-3 space-y-2">
        {postmortem.findings.map((finding) => (
          <li key={finding} className="text-xs text-steel">
            {finding}
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-[8px] border border-whisper bg-plane px-3 py-3">
        <div className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
          {lesson ? "Feedback write" : "Next adjustment"}
        </div>
        <p className="mt-1 text-xs text-bone">
          {lesson ? lessonCopy(lesson.action) : postmortem.nextAdjustment}
        </p>
      </div>
    </div>
  );
}

function CycleHistoryPanel() {
  const cycleHistory = useAutonomyStore((state) => state.cycleHistory);
  const totalPnl = cycleHistory.reduce((total, cycle) => total + cycle.pnlUsd, 0);

  return (
    <div className="rounded-[8px] border border-whisper bg-edge/50 p-3">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
          Cycle ledger
        </div>
        <div className="flex items-center gap-3">
          <MonoNumber
            value={cycleHistory.length}
            display={`${cycleHistory.length} cycles`}
            size="2xs"
            variant="muted"
          />
          <MonoNumber
            value={totalPnl}
            size="2xs"
            unit="USD"
            precision={2}
            variant={totalPnl >= 0 ? "positive" : "negative"}
          />
        </div>
      </div>

      {cycleHistory.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-whisper bg-plane/70 px-4 py-5 text-sm text-muted-steel">
          Completed cycles will land here after the runner writes postmortems and
          lessons.
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
          {cycleHistory.slice(0, 8).map((cycle) => {
            const positive = cycle.pnlUsd >= 0;
            const reason =
              cycle.status === "no_entry"
                ? "no entry"
                : cycle.closeReason ?? "closed";

            return (
              <div
                key={cycle.cycleId}
                className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-3"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span data-mono className="text-2xs text-muted-steel">
                    {cycle.cycleId}
                  </span>
                  <span
                    data-mono
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs uppercase",
                      cycle.status === "no_entry"
                        ? "border-sand/50 text-sand"
                        : positive
                          ? "border-teal/50 text-teal"
                          : "border-rust/60 text-rust",
                    )}
                  >
                    {reason}
                  </span>
                </div>
                <h3 className="mt-2 truncate text-xs font-semibold text-bone">
                  {cycle.marketTitle}
                </h3>
                <p className="mt-1 line-clamp-2 text-2xs text-steel">
                  {cycle.summary}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span data-mono className="text-2xs text-muted-steel">
                    {formatTimestampShort(Math.trunc(cycle.createdAt / 1_000))}
                  </span>
                  <MonoNumber
                    value={cycle.pnlUsd}
                    size="2xs"
                    unit="USD"
                    precision={2}
                    variant={positive ? "positive" : "negative"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionRunbookPanel({ session }: { session: SessionRunbook | null }) {
  if (session === null) {
    return (
      <div className="rounded-[8px] border border-dashed border-whisper bg-edge/50 px-4 py-5 text-sm text-muted-steel">
        Session runbook will appear after a paper loop or single cycle writes
        the continuity artifact.
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-whisper bg-edge/50 p-3">
      <div className="mb-3 flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            Session runbook
          </div>
          <p className="mt-1 text-sm text-bone">{session.operatorSummary}</p>
        </div>
        <div className="shrink-0 rounded-[8px] border border-whisper bg-plane px-3 py-2 text-2xs text-steel md:max-w-[340px]">
          <span className="font-semibold uppercase tracking-[0.14em] text-muted-steel">
            Next cycle
          </span>
          <span data-mono className="ml-2 uppercase text-amber">
            {session.nextCycleScenario}
          </span>
          <p className="mt-1 text-muted-steel">
            {session.nextCycleRecommendation}
          </p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <Metric label="cycles" value={String(session.cycleCount)} />
        <Metric label="wins" value={String(session.wins)} />
        <Metric label="losses" value={String(session.losses)} />
        <Metric label="no entries" value={String(session.noEntries)} />
        <Metric
          label="aggregate pnl"
          value={`${session.aggregatePnlUsd.toFixed(2)} USD`}
        />
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-4">
        {session.cycleTrace.slice(0, 8).map((cycle) => (
          <div
            key={cycle.cycleId}
            className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span data-mono className="text-2xs text-muted-steel">
                {cycle.cycleId}
              </span>
              <span data-mono className="text-2xs uppercase text-muted-steel">
                {cycle.scenario}
              </span>
            </div>
            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
              <span className="text-xs font-semibold text-bone">
                {cycle.result.replaceAll("_", " ")}
              </span>
              <MonoNumber
                value={cycle.pnlUsd}
                size="2xs"
                unit="USD"
                precision={2}
                variant={cycle.pnlUsd >= 0 ? "positive" : "negative"}
              />
            </div>
            <p className="mt-2 line-clamp-2 text-2xs text-steel">
              {cycle.nextAdjustment}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortVectorLabel(label: string) {
  return label
    .replace("Signal quality", "signal")
    .replace("Spread discipline", "spread")
    .replace("Upside capture", "upside")
    .replace("Downside protection", "downside")
    .replace("Stale exposure", "stale")
    .replace("Lesson fit", "lesson");
}

function shortVectorCode(id: string, label: string) {
  switch (id) {
    case "signal_quality":
      return "sig";
    case "spread_discipline":
      return "spr";
    case "upside_capture":
      return "up";
    case "downside_protection":
      return "down";
    case "stale_exposure":
      return "stale";
    case "lesson_fit":
      return "learn";
    default:
      return shortVectorLabel(label);
  }
}

function lessonCopy(action: string) {
  switch (action) {
    case "reinforce_target_hit_setup":
      return "Keep this target-hit setup active, but do not increase size until it repeats.";
    case "relax_one_entry_constraint":
      return "Loosen exactly one entry constraint next cycle; keep spread and momentum discipline.";
    case "cooldown_symbol_after_loss":
      return "Cool down this symbol and demand stronger impulse before re-entry.";
    case "Loosen exactly one entry gate before the next signal watch.":
    case "Keep constraints unchanged for the next cycle.":
    case "Skip this token/side unless a later signal is materially stronger.":
      return action;
    default:
      return action.replaceAll("_", " ");
  }
}

export function AutonomyCyclePanel() {
  const signals = useSignals();
  const [launchState, setLaunchState] = useState<
    "idle" | "starting" | "running" | "failed"
  >("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchStartedAt, setLaunchStartedAt] = useState<number | null>(null);
  const [launchTargetCycleNumber, setLaunchTargetCycleNumber] = useState<
    number | null
  >(null);
  const [runScenario, setRunScenario] = useState<RunScenario>("target");
  const [serverOperatorFlow, setServerOperatorFlow] =
    useState<OperatorFlowSnapshot | null>(null);
  const phase = useAutonomyStore((state) => state.phase);
  const cycleNumber = useAutonomyStore((state) => state.cycleNumber);
  const artifactSource = useAutonomyStore((state) => state.artifactSource);
  const artifactHydrated = useAutonomyStore((state) => state.artifactHydrated);
  const strategyDecision = useAutonomyStore((state) => state.strategyDecision);
  const selectedStrategyId = useAutonomyStore(
    (state) => state.selectedStrategyId,
  );
  const strategies = useAutonomyStore((state) => state.strategies);
  const signalObservation = useAutonomyStore(
    (state) => state.signalObservation,
  );
  const activeCycle = useAutonomyStore((state) => state.activeCycle);
  const cycleHistory = useAutonomyStore((state) => state.cycleHistory);
  const sessionRunbook = useAutonomyStore((state) => state.sessionRunbook);
  const postmortems = useAutonomyStore((state) => state.postmortems);
  const lessons = useAutonomyStore((state) => state.lessons);
  const statusLine = useAutonomyStore((state) => state.statusLine);
  const lastDecisionAt = useAutonomyStore((state) => state.lastDecisionAt);
  const generateIdeas = useAutonomyStore((state) => state.generateIdeas);
  const selectStrategy = useAutonomyStore((state) => state.selectStrategy);
  const advance = useAutonomyStore((state) => state.advance);

  const runIsActive =
    launchState === "starting" ||
    launchState === "running" ||
    phase === "signal_watch" ||
    phase === "monitor_exit" ||
    phase === "postmortem";

  useEffect(() => {
    const handle = globalThis.setInterval(() => {
      advance(signals, Date.now());
    }, 1_000);

    return () => {
      globalThis.clearInterval(handle);
    };
  }, [advance, signals]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    async function loadOperatorFlow() {
      if (inFlight) {
        return;
      }

      const requestController = new AbortController();
      controller = requestController;
      inFlight = true;
      try {
        const response = await fetch("/api/autonomy/operator-flow", {
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) {
          return;
        }
        const snapshot = (await response.json()) as OperatorFlowSnapshot;
        if (!stopped) {
          setServerOperatorFlow(snapshot);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      } finally {
        inFlight = false;
      }
    }

    void loadOperatorFlow();
    const handle = globalThis.setInterval(() => {
      void loadOperatorFlow();
    }, 2_000);

    return () => {
      stopped = true;
      globalThis.clearInterval(handle);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    if (
      launchState === "running" &&
      phase === "learn" &&
      launchTargetCycleNumber !== null &&
      cycleNumber >= launchTargetCycleNumber &&
      lastDecisionAt !== null &&
      launchStartedAt !== null &&
      lastDecisionAt >= launchStartedAt
    ) {
      setLaunchState("idle");
      setLaunchTargetCycleNumber(null);
    }
  }, [
    cycleNumber,
    lastDecisionAt,
    launchStartedAt,
    launchState,
    launchTargetCycleNumber,
    phase,
  ]);

  const selectedStrategy = useMemo(
    () =>
      strategies.find((strategy) => strategy.id === selectedStrategyId) ??
      strategies[0] ??
      fallbackStrategy,
    [selectedStrategyId, strategies],
  );
  const latestPostmortem = postmortems[0] ?? null;
  const latestLesson = lessons[0] ?? null;
  const localOperatorFlow = useMemo(
    () =>
      buildOperatorFlowSnapshot({
        phase,
        cycleNumber,
        statusLine,
        strategies,
        strategyDecision,
        signal: signalObservation,
        activeCycle,
        cycleHistory,
        sessionRunbook,
        postmortems,
        lessons,
      }),
    [
      activeCycle,
      cycleHistory,
      cycleNumber,
      lessons,
      phase,
      postmortems,
      sessionRunbook,
      signalObservation,
      statusLine,
      strategyDecision,
      strategies,
    ],
  );
  const operatorFlow =
    artifactHydrated && serverOperatorFlow !== null
      ? serverOperatorFlow
      : localOperatorFlow;
  const strategyFlowById = useMemo(
    () =>
      new Map(
        operatorFlow.strategySlate.map((strategy) => [strategy.id, strategy]),
      ),
    [operatorFlow.strategySlate],
  );
  const recommendedRunScenario = isRunScenario(
    sessionRunbook?.nextCycleScenario,
  )
    ? sessionRunbook.nextCycleScenario
    : null;

  const lastDecisionLabel =
    lastDecisionAt === null
      ? "-"
      : formatTimestampShort(Math.trunc(lastDecisionAt / 1_000));

  async function launchPaperCycle(
    mode: "single" | "loop" | "recommended" = "single",
  ) {
    const startedAt = Date.now();
    const launchScenario =
      mode === "recommended" && recommendedRunScenario
        ? recommendedRunScenario
        : runScenario;
    const scenarioSequence =
      mode === "loop" ? loopSequence(launchScenario) : [launchScenario];
    const requestScenarioSequence =
      mode === "recommended" ? undefined : scenarioSequence;
    setLaunchState("starting");
    setLaunchStartedAt(startedAt);
    setLaunchTargetCycleNumber(cycleNumber + scenarioSequence.length);
    setLaunchError(null);

    try {
      const response = await fetch("/api/autonomy/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          scenario: mode === "recommended" ? "recommended" : launchScenario,
          scenarioSequence: requestScenarioSequence,
          source: "simulated",
          symbols: ["BTC/USDT", "ETH/USDT"],
          cycleCount: mode === "loop" ? String(scenarioSequence.length) : "1",
          riskBudgetUsd: "25",
          phaseDelaySecs: mode === "loop" ? "1" : "2.5",
        }),
      });

      if (!response.ok) {
        throw new Error(`Runner launch failed with HTTP ${response.status}.`);
      }

      setLaunchState("running");
    } catch (error) {
      setLaunchState("failed");
      setLaunchTargetCycleNumber(null);
      setLaunchError(
        error instanceof Error
          ? error.message
          : "Runner launch failed before a cycle started.",
      );
    }
  }

  const selectedRunScenario =
    RUN_SCENARIOS.find((scenario) => scenario.id === runScenario) ??
    RUN_SCENARIOS[0];
  const selectedLoopSequence = loopSequence(runScenario);

  return (
    <section className="min-w-0 rounded-[8px] border border-whisper bg-plane">
      <div className="flex min-w-0 flex-col gap-3 border-b border-whisper px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            <BrainCircuit className="size-3.5 text-amber" aria-hidden="true" />
            Autonomy Loop
            <span data-mono className="text-ghost">
              #{cycleNumber.toString().padStart(3, "0")}
            </span>
            <span
              data-mono
              className={cn(
                "rounded-full border px-2 py-0.5 tracking-[0.12em]",
                artifactHydrated
                  ? "border-teal/40 bg-teal/10 text-teal"
                  : "border-whisper bg-edge text-muted-steel",
              )}
            >
              {artifactHydrated ? "artifact-backed" : "simulated"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="truncate text-lg font-semibold text-bone">
              {selectedStrategy.title}
            </h2>
            <span data-mono className="text-2xs text-muted-steel">
              {selectedStrategy.domain} / {lastDecisionLabel}
            </span>
            {artifactSource?.kind === "error" && (
              <span className="text-2xs text-rust">
                {artifactSource.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={runScenario}
            onValueChange={(value) => {
              if (RUN_SCENARIOS.some((scenario) => scenario.id === value)) {
                setRunScenario(value as RunScenario);
              }
            }}
            variant="outline"
            size="sm"
            disabled={runIsActive}
          >
            {RUN_SCENARIOS.map((scenario) => (
              <ToggleGroupItem
                key={scenario.id}
                value={scenario.id}
                className="border-whisper bg-edge text-2xs text-muted-steel data-[state=on]:text-bone"
              >
                {scenario.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="border border-whisper bg-edge text-bone hover:bg-plane"
            onClick={() => generateIdeas()}
          >
            <BrainCircuit className="size-3.5" aria-hidden="true" />
            Ideate
          </Button>
          <Button
            type="button"
            size="sm"
            className="border border-amber/40 bg-amber text-canvas hover:bg-amber/90"
            onClick={() => {
              void launchPaperCycle();
            }}
            disabled={runIsActive}
          >
            <Play className="size-3.5" aria-hidden="true" />
            {launchState === "starting"
              ? "Starting"
              : launchState === "running"
                ? "Running"
                : "Run one"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="border border-whisper bg-edge text-muted-steel hover:bg-plane hover:text-bone"
            onClick={() => {
              void launchPaperCycle("loop");
            }}
            disabled={runIsActive}
          >
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            Loop x4
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="border border-teal/40 bg-teal/10 text-teal hover:bg-teal/15"
            onClick={() => {
              void launchPaperCycle("recommended");
            }}
            disabled={runIsActive || recommendedRunScenario === null}
          >
            <Target className="size-3.5" aria-hidden="true" />
            Run rec
          </Button>
          {launchError && (
            <span className="text-2xs text-rust">{launchError}</span>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex min-w-0 flex-col gap-2 rounded-[8px] border border-whisper bg-edge/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="text-xs text-steel">
            {selectedRunScenario.status}
          </span>
          <span
            data-mono
            className="min-w-0 break-words text-2xs uppercase text-muted-steel [overflow-wrap:anywhere] sm:text-right"
          >
            {selectedLoopSequence.join(" -> ")}
          </span>
        </div>
        <OperatorBriefPanel flow={operatorFlow} session={sessionRunbook} />
        <PhaseRail phase={phase} />
        <CycleStoryPanel
          phase={phase}
          strategy={selectedStrategy}
          ideaCount={strategies.length}
          signal={signalObservation}
          cycle={activeCycle}
          postmortem={latestPostmortem}
          lesson={latestLesson}
          statusLine={statusLine}
        />
        <OperatorTimelinePanel flow={operatorFlow} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
          <div className="min-w-0 rounded-[8px] border border-whisper bg-edge/50 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
                Strategy Slate
              </div>
              <MonoNumber
                value={strategies.length}
                display={`${strategies.length} ideas`}
                size="2xs"
                variant="muted"
              />
            </div>
            <div className="space-y-2">
              {strategies.map((strategy) => (
                <StrategyRow
                  key={strategy.id}
                  strategy={strategy}
                  flowStrategy={strategyFlowById.get(strategy.id) ?? null}
                  selected={strategy.id === selectedStrategyId}
                  onSelect={() => selectStrategy(strategy.id)}
                />
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-4">
            <SignalDecisionPanel
              signal={signalObservation}
              selectedStrategy={selectedStrategy}
              statusLine={statusLine}
            />
            <ContractMonitor />
            <PostmortemPanel />
          </div>
        </div>
        <CycleHistoryPanel />
        <SessionRunbookPanel session={sessionRunbook} />
      </div>
    </section>
  );
}
