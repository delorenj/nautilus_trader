import type {
  ActiveContractCycle,
  AutonomyPhase,
  CycleLedgerEntry,
  CyclePostmortem,
  SignalObservation,
  StrategyHypothesis,
  StrategyLesson,
} from "@/lib/stores/autonomy-store";

export interface AutonomyArtifactSource {
  kind: "artifact" | "empty" | "error";
  varDir: string;
  loadedAt: number;
  message: string;
  files: {
    runtime: string;
    cycles: string;
    postmortems: string;
    lessons: string;
    signals: string;
    strategies: string;
    decisions?: string;
    sessionRunbook?: string;
    sessionRunbooks?: string;
  };
}

export interface StrategyDecisionScore {
  strategyId: string;
  rank: number;
  title: string;
  score: number;
  confidence: number;
  riskBudgetUsd: number;
  constraintVector: string;
  lessonAdjustment: string;
  rationale: string;
  vectorScores: StrategyDecisionVector[];
}

export interface StrategyDecisionVector {
  id: string;
  label: string;
  score: number;
  rationale: string;
}

export interface StrategyDecision {
  cycleId: string;
  createdAt: number;
  selectedStrategyId: string;
  selectedRank: number;
  domain: string;
  symbol: string;
  hypothesesCount: number;
  lessonsConsideredCount: number;
  lessonsConsidered: string[];
  lessonInfluences: string[];
  selectedReason: string;
  scoring: StrategyDecisionScore[];
}

export interface SessionCycleTrace {
  cycleId: string;
  scenario: string;
  result: string;
  closeReason: string;
  pnlUsd: number;
  lessonAction: string;
  nextAdjustment: string;
}

export interface SessionRunbook {
  sessionId: string;
  startedAt: number;
  completedAt: number;
  status: "completed" | "running" | "failed";
  cycleCount: number;
  scenarioSequence: string[];
  cycleIds: string[];
  aggregatePnlUsd: number;
  wins: number;
  losses: number;
  noEntries: number;
  latestLessonAction: string;
  nextCycleScenario: string;
  nextCycleRecommendation: string;
  operatorSummary: string;
  cycleTrace: SessionCycleTrace[];
}

export interface AutonomySnapshot {
  source: AutonomyArtifactSource;
  phase: AutonomyPhase;
  cycleNumber: number;
  statusLine: string;
  strategies: StrategyHypothesis[];
  strategyDecision?: StrategyDecision | null;
  sessionRunbook?: SessionRunbook | null;
  signal: SignalObservation | null;
  activeCycle: ActiveContractCycle | null;
  cycleHistory: CycleLedgerEntry[];
  postmortems: CyclePostmortem[];
  lessons: StrategyLesson[];
}
