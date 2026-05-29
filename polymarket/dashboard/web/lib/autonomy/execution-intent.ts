import type { Side } from "@/lib/stream/types";

import type { ExecutionGateStatus, ExecutionReadinessSnapshot } from "./live-readiness";
import type { AutonomySnapshot } from "./types";

export type ExecutionIntentStatus =
  | "blocked"
  | "paper-ready"
  | "live-ready-dry-run";

export interface ExecutionIntentCheck {
  id: string;
  label: string;
  status: ExecutionGateStatus;
  detail: string;
}

export interface KrakenSpotOrderIntent {
  intentId: string;
  role: "entry" | "take_profit" | "stop_loss" | "timebox_exit";
  clientOrderId: string;
  instrumentId: string;
  symbol: string;
  side: Side;
  orderType: "MARKET" | "LIMIT" | "STOP_MARKET";
  timeInForce: "IOC" | "GTC";
  quoteNotionalUsd: number | null;
  baseQuantity: number | null;
  limitPrice: number | null;
  triggerPrice: number | null;
  reduceOnly: boolean;
  reason: string;
}

export interface ExecutionSubmissionState {
  enabled: false;
  mode: "paper" | "live-ready";
  reason: string;
  blockedBy: string[];
}

export interface ExecutionReconciliationPlan {
  status: "not_submitted" | "paper_reconciled";
  latestPaper: {
    cycleId: string;
    status: "open" | "closed";
    closeReason: "target" | "stop" | "timebox" | null;
    pnlUsd: number;
    symbol: string;
    entryPrice: number;
    exitPrice: number | null;
    sizeUsd: number;
  } | null;
  expectedLiveFields: string[];
  notes: string[];
}

export interface ExecutionIntentSnapshot {
  generatedAt: number;
  venue: "KRAKEN";
  productType: "SPOT";
  status: ExecutionIntentStatus;
  statusLabel: string;
  cycleId: string | null;
  strategyId: string | null;
  signalId: string | null;
  entry: KrakenSpotOrderIntent | null;
  exits: KrakenSpotOrderIntent[];
  checks: ExecutionIntentCheck[];
  submission: ExecutionSubmissionState;
  reconciliation: ExecutionReconciliationPlan;
}

function check(
  id: string,
  label: string,
  status: ExecutionGateStatus,
  detail: string,
): ExecutionIntentCheck {
  return { id, label, status, detail };
}

function sideOpposite(side: Side): Side {
  return side === "BUY" ? "SELL" : "BUY";
}

function normalizeSymbol(symbol: string | undefined) {
  return symbol?.trim().toUpperCase() || "BTC/USDT";
}

function symbolFromMarketTitle(title: string | undefined) {
  return title?.match(/[A-Z0-9]+\/[A-Z0-9]+/)?.[0];
}

function cycleSuffix(cycleId: string | null) {
  const match = cycleId?.match(/(\d+)$/);
  return match ? match[1] : "next";
}

function intentId(cycleId: string | null, role: KrakenSpotOrderIntent["role"]) {
  return `intent-${cycleId ?? "next"}-${role}`;
}

function clientOrderId(cycleId: string | null, role: KrakenSpotOrderIntent["role"]) {
  const prefix =
    role === "entry"
      ? "entry"
      : role === "take_profit"
        ? "tp"
        : role === "stop_loss"
          ? "sl"
          : "tb";

  return `ks-${cycleSuffix(cycleId)}-${prefix}`.slice(0, 18);
}

function quantity(notional: number | null, price: number | null) {
  if (notional === null || price === null || price <= 0) {
    return null;
  }

  return Number((notional / price).toFixed(8));
}

function cappedNotional(
  requested: number | null,
  readiness: ExecutionReadinessSnapshot,
) {
  if (requested === null) {
    return null;
  }

  const maxNotional = readiness.risk.maxNotionalUsd;
  return maxNotional === null ? requested : Math.min(requested, maxNotional);
}

function passedCheckIds(readiness: ExecutionReadinessSnapshot) {
  return new Set(
    readiness.checks
      .filter((item) => item.status === "pass")
      .map((item) => item.id),
  );
}

function readinessBlockers(readiness: ExecutionReadinessSnapshot) {
  return readiness.checks
    .filter((item) => item.required && item.status === "fail")
    .map((item) => item.label);
}

function latestPaper(autonomy: AutonomySnapshot): ExecutionReconciliationPlan["latestPaper"] {
  const cycle = autonomy.activeCycle;
  if (cycle === null) {
    return null;
  }

  return {
    cycleId: cycle.cycleId,
    status: cycle.status,
    closeReason: cycle.closeReason,
    pnlUsd: cycle.pnlUsd,
    symbol: symbolFromMarketTitle(cycle.marketTitle) ?? "BTC/USDT",
    entryPrice: cycle.entryPrice,
    exitPrice: cycle.exitPrice,
    sizeUsd: cycle.sizeUsd,
  };
}

export function buildExecutionIntentSnapshot(
  autonomy: AutonomySnapshot,
  readiness: ExecutionReadinessSnapshot,
  generatedAt = Date.now(),
): ExecutionIntentSnapshot {
  const signal = autonomy.signal;
  const cycle = autonomy.activeCycle;
  const strategy =
    autonomy.strategies.find((item) => item.status !== "candidate") ??
    autonomy.strategies[0] ??
    null;
  const cycleId =
    cycle?.cycleId ?? autonomy.cycleHistory[0]?.cycleId ?? `cycle-${autonomy.cycleNumber}`;
  const signalPassed = signal?.passed === true;
  const symbol = normalizeSymbol(
    signal?.symbol ?? symbolFromMarketTitle(cycle?.marketTitle),
  );
  const instrumentId = signal?.instrumentId || `${symbol}.KRAKEN`;
  const referencePrice = signal?.referencePrice ?? cycle?.entryPrice ?? null;
  const requestedNotional =
    signal?.suggestedNotional ?? cycle?.sizeUsd ?? strategy?.riskBudgetUsd ?? null;
  const notional = cappedNotional(requestedNotional, readiness);
  const baseQuantity = quantity(notional, referencePrice);
  const intentReady = signalPassed && referencePrice !== null && notional !== null;
  const allowedSymbols = readiness.risk.symbolAllowlist;
  const symbolAllowed =
    allowedSymbols.length === 0 ? null : allowedSymbols.includes(symbol.toUpperCase());
  const passIds = passedCheckIds(readiness);

  const entry: KrakenSpotOrderIntent | null = intentReady
    ? {
        intentId: intentId(cycleId, "entry"),
        role: "entry",
        clientOrderId: clientOrderId(cycleId, "entry"),
        instrumentId,
        symbol,
        side: signal.side,
        orderType: "MARKET",
        timeInForce: "IOC",
        quoteNotionalUsd: notional,
        baseQuantity,
        limitPrice: null,
        triggerPrice: null,
        reduceOnly: false,
        reason: signal.reason,
      }
    : null;

  const exitSide = entry ? sideOpposite(entry.side) : "SELL";
  const exitQuantity = entry?.baseQuantity ?? quantity(cycle?.sizeUsd ?? null, cycle?.entryPrice ?? null);
  const exits: KrakenSpotOrderIntent[] =
    entry === null || referencePrice === null
      ? []
      : [
          {
            intentId: intentId(cycleId, "take_profit"),
            role: "take_profit",
            clientOrderId: clientOrderId(cycleId, "take_profit"),
            instrumentId,
            symbol,
            side: exitSide,
            orderType: "LIMIT",
            timeInForce: "GTC",
            quoteNotionalUsd: null,
            baseQuantity: exitQuantity,
            limitPrice: cycle?.targetPrice ?? Number((referencePrice * 1.0055).toFixed(2)),
            triggerPrice: null,
            reduceOnly: false,
            reason: "Take profit at the strategy target before stale exposure builds.",
          },
          {
            intentId: intentId(cycleId, "stop_loss"),
            role: "stop_loss",
            clientOrderId: clientOrderId(cycleId, "stop_loss"),
            instrumentId,
            symbol,
            side: exitSide,
            orderType: "STOP_MARKET",
            timeInForce: "GTC",
            quoteNotionalUsd: null,
            baseQuantity: exitQuantity,
            limitPrice: null,
            triggerPrice: cycle?.stopPrice ?? Number((referencePrice * 0.997).toFixed(2)),
            reduceOnly: false,
            reason: "Protect downside by selling the acquired spot quantity at the stop trigger.",
          },
          {
            intentId: intentId(cycleId, "timebox_exit"),
            role: "timebox_exit",
            clientOrderId: clientOrderId(cycleId, "timebox_exit"),
            instrumentId,
            symbol,
            side: exitSide,
            orderType: "MARKET",
            timeInForce: "IOC",
            quoteNotionalUsd: null,
            baseQuantity: exitQuantity,
            limitPrice: null,
            triggerPrice: null,
            reduceOnly: false,
            reason: "Exit by timebox if the position stops progressing toward target.",
          },
        ];

  const checks = [
    check(
      "signal",
      "Signal accepted",
      signalPassed ? "pass" : "fail",
      signal === null
        ? "No signal observation is loaded for the latest cycle."
        : signalPassed
          ? "Latest signal passed the selected entry gate."
          : signal.reason,
    ),
    check(
      "ticket",
      "Order ticket",
      intentReady ? "pass" : "fail",
      intentReady
        ? `${entry?.side ?? "BUY"} ${symbol} market IOC ticket is buildable.`
        : "A ticket needs a passed signal, reference price, and notional.",
    ),
    check(
      "allowlist",
      "Symbol allowlist",
      symbolAllowed === null ? "warn" : symbolAllowed ? "pass" : "fail",
      symbolAllowed === null
        ? "No live allowlist is configured; paper intent can still be displayed."
        : symbolAllowed
          ? `${symbol} is included in KRAKEN_SPOT_SYMBOL_ALLOWLIST.`
          : `${symbol} is not included in KRAKEN_SPOT_SYMBOL_ALLOWLIST.`,
    ),
    check(
      "notional",
      "Notional cap",
      notional !== null && requestedNotional !== null && notional <= requestedNotional
        ? "pass"
        : "fail",
      notional === null
        ? "No notional could be derived from the signal or strategy."
        : readiness.risk.maxNotionalUsd === null
          ? `Paper notional is ${notional.toFixed(2)} USD; no live cap is configured.`
          : `Ticket notional is capped at ${notional.toFixed(2)} USD.`,
    ),
    check(
      "readiness",
      "Execution gate",
      readiness.liveBlocked ? "fail" : "pass",
      readiness.liveBlocked
        ? "Live submission remains blocked by the execution gate."
        : "Execution gate is live-ready.",
    ),
    check(
      "executor",
      "Live submitter",
      "fail",
      "Live submitter is intentionally disabled in this scaffold; this endpoint only emits order intents.",
    ),
  ];

  const blockedBy = [
    ...checks
      .filter((item) => item.status === "fail")
      .map((item) => item.label),
    ...readinessBlockers(readiness),
  ].filter((item, index, items) => items.indexOf(item) === index);
  const status: ExecutionIntentStatus =
    entry === null
      ? "blocked"
      : readiness.liveBlocked
        ? "paper-ready"
        : "live-ready-dry-run";

  return {
    generatedAt,
    venue: "KRAKEN",
    productType: "SPOT",
    status,
    statusLabel:
      entry === null
        ? "No executable ticket is available for the latest cycle."
        : readiness.liveBlocked
          ? "Paper order intent is ready; live submission is blocked."
          : "Live gates are ready; submitter remains disabled for dry-run review.",
    cycleId,
    strategyId: strategy?.id ?? null,
    signalId: signal?.signalId ?? null,
    entry,
    exits,
    checks,
    submission: {
      enabled: false,
      mode: readiness.liveBlocked ? "paper" : "live-ready",
      reason:
        passIds.size > 0 && !readiness.liveBlocked
          ? "Readiness passed, but this scaffold does not submit live Kraken orders."
          : "Live submission is disabled until all gates pass and the live submitter is explicitly implemented.",
      blockedBy,
    },
    reconciliation: {
      status: cycle?.status === "closed" ? "paper_reconciled" : "not_submitted",
      latestPaper: latestPaper(autonomy),
      expectedLiveFields: [
        "krakenOrderId",
        "clientOrderId",
        "submittedAt",
        "acceptedAt",
        "filledQuantity",
        "averageFillPrice",
        "feeAmount",
        "feeCurrency",
        "slippageBps",
        "realizedPnlUsd",
      ],
      notes: [
        "Every live entry must write an order id before an exit intent can be armed.",
        "Every live exit must reconcile fills, fees, slippage, and realized PnL before the postmortem runs.",
      ],
    },
  };
}
