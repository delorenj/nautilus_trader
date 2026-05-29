import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { autonomyArtifactVarDir } from "./artifacts";
import type {
  ExecutionIntentSnapshot,
  KrakenSpotOrderIntent,
} from "./execution-intent";
import {
  buildKrakenSpotLiveCommandDescriptor,
  krakenSpotExecutorArmed,
  krakenSpotExecutorConfirmed,
  type KrakenSpotLiveCommandDescriptor,
} from "./live-executor";
import type { ExecutionReadinessSnapshot } from "./live-readiness";

export type ExecutionSubmitMode = "dry-run" | "live";
export type ExecutionAttemptStatus =
  | "NO_TICKET"
  | "DRY_RUN_RECORDED"
  | "LIVE_BLOCKED"
  | "LIVE_COMMAND_READY";

export interface ExecutionSubmitRequest {
  mode?: ExecutionSubmitMode;
}

export interface ExecutionAttemptArtifact {
  eventType: "kraken_spot.execution_attempt.v1";
  attemptId: string;
  createdAt: number;
  mode: ExecutionSubmitMode;
  status: ExecutionAttemptStatus;
  statusLabel: string;
  cycleId: string | null;
  signalId: string | null;
  entry: KrakenSpotOrderIntent | null;
  exits: KrakenSpotOrderIntent[];
  liveGate: "paper" | "live-ready";
  executorArmed: boolean;
  executorConfirmed: boolean;
  submitted: false;
  blockedBy: string[];
  liveCommand: KrakenSpotLiveCommandDescriptor | null;
}

export interface ExecutionFillArtifact {
  role: KrakenSpotOrderIntent["role"];
  clientOrderId: string;
  krakenOrderId: string | null;
  submittedAt: number | null;
  acceptedAt: number | null;
  filledAt: number | null;
  symbol: string;
  side: KrakenSpotOrderIntent["side"];
  filledQuantity: number | null;
  averageFillPrice: number | null;
  notionalUsd: number | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  slippageBps: number | null;
  realizedPnlUsd: number | null;
  source: "paper" | "kraken_live";
}

export interface ExecutionReconciliationArtifact {
  eventType: "kraken_spot.execution_reconciliation.v1";
  attemptId: string;
  createdAt: number;
  status: "dry_run_reconciled" | "not_submitted";
  cycleId: string | null;
  closeReason: "target" | "stop" | "timebox" | null;
  readyForPostmortem: boolean;
  krakenOrderId: null;
  clientOrderId: string | null;
  submittedAt: null;
  acceptedAt: null;
  filledQuantity: null;
  averageFillPrice: null;
  feeAmount: null;
  feeCurrency: null;
  slippageBps: null;
  realizedPnlUsd: number | null;
  entryFill: ExecutionFillArtifact | null;
  exitFill: ExecutionFillArtifact | null;
  fills: ExecutionFillArtifact[];
  notes: string[];
}

export interface ExecutionSubmitState {
  attempt: ExecutionAttemptArtifact | null;
  reconciliation: ExecutionReconciliationArtifact | null;
}

export interface ExecutionSubmitResult {
  ok: boolean;
  attempt: ExecutionAttemptArtifact;
  reconciliation: ExecutionReconciliationArtifact;
}

function attemptPath(varDir: string) {
  return join(varDir, "execution_attempts.jsonl");
}

function reconciliationPath(varDir: string) {
  return join(varDir, "execution_reconciliations.jsonl");
}

function normalizeMode(value: unknown): ExecutionSubmitMode {
  return value === "live" ? "live" : "dry-run";
}

function appendJsonl(path: string, row: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(row, null, 0)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

function readJsonl(path: string): unknown[] {
  if (!existsSync(path)) {
    return [];
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [];
      }
      try {
        return [JSON.parse(trimmed) as unknown];
      } catch {
        return [];
      }
    });
}

function isAttempt(value: unknown): value is ExecutionAttemptArtifact {
  return (
    typeof value === "object" &&
    value !== null &&
    "eventType" in value &&
    value.eventType === "kraken_spot.execution_attempt.v1"
  );
}

function isReconciliation(
  value: unknown,
): value is ExecutionReconciliationArtifact {
  return (
    typeof value === "object" &&
    value !== null &&
    "eventType" in value &&
    value.eventType === "kraken_spot.execution_reconciliation.v1"
  );
}

function latestByCreatedAt<T extends { createdAt: number }>(rows: T[]) {
  return rows.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
}

function executionBlockers(
  intent: ExecutionIntentSnapshot,
  readiness: ExecutionReadinessSnapshot,
  executorArmed: boolean,
  executorConfirmed: boolean,
) {
  const blockers = [...intent.submission.blockedBy];

  if (readiness.liveBlocked) {
    blockers.push("Execution gate");
  }
  if (!executorArmed) {
    blockers.push("Live executor flag");
  }
  if (!executorConfirmed) {
    blockers.push("Live executor confirmation");
  }

  return blockers.filter((item, index, items) => items.indexOf(item) === index);
}

function attemptId(intent: ExecutionIntentSnapshot, createdAt: number) {
  const cycle = intent.cycleId ?? "no-cycle";
  return `exec-${cycle}-${createdAt}`;
}

function exitRoleForCloseReason(
  closeReason: string | null | undefined,
): KrakenSpotOrderIntent["role"] | null {
  if (closeReason === "target") {
    return "take_profit";
  }
  if (closeReason === "stop") {
    return "stop_loss";
  }
  if (closeReason === "timebox") {
    return "timebox_exit";
  }
  return null;
}

function quoteCurrency(symbol: string) {
  return symbol.split("/")[1]?.trim().toUpperCase() || "USDT";
}

function notional(quantity: number | null, price: number | null) {
  if (quantity === null || price === null) {
    return null;
  }

  return Number((quantity * price).toFixed(2));
}

function buildPaperFill({
  intent,
  averageFillPrice,
  createdAt,
  realizedPnlUsd = null,
}: {
  intent: KrakenSpotOrderIntent;
  averageFillPrice: number | null;
  createdAt: number;
  realizedPnlUsd?: number | null;
}): ExecutionFillArtifact {
  return {
    role: intent.role,
    clientOrderId: intent.clientOrderId,
    krakenOrderId: null,
    submittedAt: null,
    acceptedAt: null,
    filledAt: createdAt,
    symbol: intent.symbol,
    side: intent.side,
    filledQuantity: intent.baseQuantity,
    averageFillPrice,
    notionalUsd: notional(intent.baseQuantity, averageFillPrice),
    feeAmount: 0,
    feeCurrency: quoteCurrency(intent.symbol),
    slippageBps: 0,
    realizedPnlUsd,
    source: "paper",
  };
}

function buildDryRunFills(
  attempt: ExecutionAttemptArtifact,
  intent: ExecutionIntentSnapshot,
  createdAt: number,
) {
  const latestPaper = intent.reconciliation.latestPaper;
  if (attempt.entry === null || latestPaper === null) {
    return {
      entryFill: null,
      exitFill: null,
      fills: [] as ExecutionFillArtifact[],
      closeReason: null,
      readyForPostmortem: false,
    };
  }

  const entryFill = buildPaperFill({
    intent: attempt.entry,
    averageFillPrice: latestPaper.entryPrice,
    createdAt,
  });
  const exitRole = exitRoleForCloseReason(latestPaper.closeReason);
  const exitIntent = exitRole
    ? attempt.exits.find((item) => item.role === exitRole) ?? null
    : null;
  const exitFill =
    latestPaper.status === "closed" &&
    latestPaper.exitPrice !== null &&
    exitIntent !== null
      ? buildPaperFill({
          intent: exitIntent,
          averageFillPrice: latestPaper.exitPrice,
          createdAt,
          realizedPnlUsd: latestPaper.pnlUsd,
        })
      : null;

  return {
    entryFill,
    exitFill,
    fills: [entryFill, exitFill].filter(
      (fill): fill is ExecutionFillArtifact => fill !== null,
    ),
    closeReason: exitRole === null ? null : latestPaper.closeReason,
    readyForPostmortem: latestPaper.status === "closed" && exitFill !== null,
  };
}

function buildAttempt(
  mode: ExecutionSubmitMode,
  intent: ExecutionIntentSnapshot,
  readiness: ExecutionReadinessSnapshot,
  env: Record<string, string | undefined>,
  createdAt: number,
): ExecutionAttemptArtifact {
  const executorArmed = krakenSpotExecutorArmed(env);
  const executorConfirmed = krakenSpotExecutorConfirmed(env);
  const liveBlockers = executionBlockers(
    intent,
    readiness,
    executorArmed,
    executorConfirmed,
  );

  if (intent.entry === null) {
    return {
      eventType: "kraken_spot.execution_attempt.v1",
      attemptId: attemptId(intent, createdAt),
      createdAt,
      mode,
      status: "NO_TICKET",
      statusLabel: "No execution ticket exists for the latest cycle.",
      cycleId: intent.cycleId,
      signalId: intent.signalId,
      entry: null,
      exits: [],
      liveGate: readiness.executionMode,
      executorArmed,
      executorConfirmed,
      submitted: false,
      blockedBy: ["Order ticket"],
      liveCommand: null,
    };
  }

  if (mode === "dry-run") {
    return {
      eventType: "kraken_spot.execution_attempt.v1",
      attemptId: attemptId(intent, createdAt),
      createdAt,
      mode,
      status: "DRY_RUN_RECORDED",
      statusLabel: "Dry-run execution ticket recorded; no Kraken order submitted.",
      cycleId: intent.cycleId,
      signalId: intent.signalId,
      entry: intent.entry,
      exits: intent.exits,
      liveGate: readiness.executionMode,
      executorArmed,
      executorConfirmed,
      submitted: false,
      blockedBy: [],
      liveCommand: null,
    };
  }

  if (readiness.liveBlocked || !executorArmed || !executorConfirmed) {
    return {
      eventType: "kraken_spot.execution_attempt.v1",
      attemptId: attemptId(intent, createdAt),
      createdAt,
      mode,
      status: "LIVE_BLOCKED",
      statusLabel: "Live execution attempt blocked before Kraken submission.",
      cycleId: intent.cycleId,
      signalId: intent.signalId,
      entry: intent.entry,
      exits: intent.exits,
      liveGate: readiness.executionMode,
      executorArmed,
      executorConfirmed,
      submitted: false,
      blockedBy: liveBlockers,
      liveCommand: null,
    };
  }

  const liveCommand = buildKrakenSpotLiveCommandDescriptor({
    intent,
    readiness,
    generatedAt: createdAt,
  });

  return {
    eventType: "kraken_spot.execution_attempt.v1",
    attemptId: attemptId(intent, createdAt),
    createdAt,
    mode,
    status: "LIVE_COMMAND_READY",
    statusLabel:
      "Live gates passed; Nautilus Kraken command descriptor recorded without submitting.",
    cycleId: intent.cycleId,
    signalId: intent.signalId,
    entry: intent.entry,
    exits: intent.exits,
    liveGate: readiness.executionMode,
    executorArmed,
    executorConfirmed,
    submitted: false,
    blockedBy: ["Live submitter implementation"],
    liveCommand,
  };
}

function buildReconciliation(
  attempt: ExecutionAttemptArtifact,
  intent: ExecutionIntentSnapshot,
  createdAt: number,
): ExecutionReconciliationArtifact {
  const dryRun = attempt.status === "DRY_RUN_RECORDED";
  const commandReady = attempt.status === "LIVE_COMMAND_READY";
  const dryRunFills = dryRun
    ? buildDryRunFills(attempt, intent, createdAt)
    : {
        entryFill: null,
        exitFill: null,
        fills: [] as ExecutionFillArtifact[],
        closeReason: null,
        readyForPostmortem: false,
      };

  return {
    eventType: "kraken_spot.execution_reconciliation.v1",
    attemptId: attempt.attemptId,
    createdAt,
    status: dryRun ? "dry_run_reconciled" : "not_submitted",
    cycleId: attempt.cycleId,
    closeReason: dryRunFills.closeReason,
    readyForPostmortem: dryRunFills.readyForPostmortem,
    krakenOrderId: null,
    clientOrderId: attempt.entry?.clientOrderId ?? null,
    submittedAt: null,
    acceptedAt: null,
    filledQuantity: null,
    averageFillPrice: null,
    feeAmount: null,
    feeCurrency: null,
    slippageBps: null,
    realizedPnlUsd: intent.reconciliation.latestPaper?.pnlUsd ?? null,
    entryFill: dryRunFills.entryFill,
    exitFill: dryRunFills.exitFill,
    fills: dryRunFills.fills,
    notes: dryRun
      ? [
          dryRunFills.readyForPostmortem
            ? "Dry-run entry and exit fills reconciled against the latest paper cycle."
            : "Dry-run entry fill recorded; exit fill waits for a closed paper cycle.",
          "No live Kraken order id exists because no order was submitted.",
        ]
      : commandReady
        ? [
            "Nautilus live command descriptor was recorded for operator review.",
            "No live Kraken order id exists because descriptor mode does not submit.",
          ]
      : [
          "No live Kraken order was submitted.",
          "Reconciliation remains a placeholder until a live submitter records fills.",
        ],
  };
}

export function readExecutionSubmitState(
  varDir = autonomyArtifactVarDir(),
): ExecutionSubmitState {
  const attempt = latestByCreatedAt(
    readJsonl(attemptPath(varDir)).filter(isAttempt),
  );
  const reconciliations = readJsonl(reconciliationPath(varDir)).filter(
    isReconciliation,
  );
  const reconciliation =
    attempt === null
      ? latestByCreatedAt(reconciliations)
      : latestByCreatedAt(
          reconciliations.filter((item) => item.attemptId === attempt.attemptId),
        );

  return {
    attempt,
    reconciliation,
  };
}

export function recordExecutionAttempt({
  request,
  intent,
  readiness,
  env,
  varDir = autonomyArtifactVarDir(),
  now = Date.now(),
}: {
  request?: ExecutionSubmitRequest;
  intent: ExecutionIntentSnapshot;
  readiness: ExecutionReadinessSnapshot;
  env: Record<string, string | undefined>;
  varDir?: string;
  now?: number;
}): ExecutionSubmitResult {
  mkdirSync(varDir, { recursive: true });
  const mode = normalizeMode(request?.mode);
  const attempt = buildAttempt(mode, intent, readiness, env, now);
  const reconciliation = buildReconciliation(attempt, intent, now);

  appendJsonl(attemptPath(varDir), attempt);
  appendJsonl(reconciliationPath(varDir), reconciliation);

  return {
    ok: attempt.status === "DRY_RUN_RECORDED",
    attempt,
    reconciliation,
  };
}
