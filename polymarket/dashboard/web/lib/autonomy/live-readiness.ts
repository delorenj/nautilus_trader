import type { AutonomySnapshot } from "./types";

export type ExecutionGateStatus = "pass" | "warn" | "fail";
export type LiveAcceptanceStatus = ExecutionGateStatus | "manual";

export interface ExecutionGateCheck {
  id: string;
  label: string;
  status: ExecutionGateStatus;
  required: boolean;
  detail: string;
}

export interface LiveAcceptanceItem {
  id: string;
  label: string;
  status: LiveAcceptanceStatus;
  required: boolean;
  detail: string;
  evidence: string | null;
}

export interface LiveAcceptanceGroup {
  id: string;
  label: string;
  summary: string;
  items: LiveAcceptanceItem[];
}

export interface LiveAcceptanceSummary {
  requiredItems: number;
  passedRequiredItems: number;
  blockingItems: number;
  manualItems: number;
  failedItems: number;
  statusLabel: string;
}

export interface LiveAcceptanceChecklist {
  summary: LiveAcceptanceSummary;
  groups: LiveAcceptanceGroup[];
}

export interface ExecutionReadinessSnapshot {
  generatedAt: number;
  venue: "KRAKEN";
  productType: "SPOT";
  executionMode: "paper" | "live-ready";
  liveBlocked: boolean;
  statusLabel: string;
  credentials: {
    apiKeyPresent: boolean;
    apiSecretPresent: boolean;
  };
  risk: {
    maxNotionalUsd: number | null;
    dailyLossLimitUsd: number | null;
    symbolAllowlist: string[];
  };
  evidence: {
    cycleCount: number;
    latestCycleId: string | null;
    latestLessonAction: string | null;
  };
  checks: ExecutionGateCheck[];
  acceptance: LiveAcceptanceChecklist;
}

const LIVE_CONFIRM_PHRASE = "I_UNDERSTAND_LIVE_KRAKEN_SPOT_RISK";
const DEFAULT_MIN_PAPER_CYCLES = 20;
const MICRO_LIVE_MAX_NOTIONAL_USD = 5;
const MICRO_LIVE_DAILY_LOSS_LIMIT_USD = 25;
const MICRO_LIVE_MAX_DAILY_ORDERS = 6;
const MICRO_LIVE_MAX_OPEN_ORDERS = 3;
const MICRO_LIVE_MAX_SLIPPAGE_BPS = 50;

function flagEnabled(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function decimalEnv(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function symbolAllowlist(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function check(
  id: string,
  label: string,
  status: ExecutionGateStatus,
  detail: string,
  required = true,
): ExecutionGateCheck {
  return {
    id,
    label,
    status,
    required,
    detail,
  };
}

function acceptanceItem(
  id: string,
  label: string,
  status: LiveAcceptanceStatus,
  detail: string,
  evidence: string | null = null,
  required = true,
): LiveAcceptanceItem {
  return {
    id,
    label,
    status,
    required,
    detail,
    evidence,
  };
}

function acceptanceGroup(
  id: string,
  label: string,
  summary: string,
  items: LiveAcceptanceItem[],
): LiveAcceptanceGroup {
  return { id, label, summary, items };
}

function positiveIntegerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveDecimalEnv(value: string | undefined): number | null {
  const parsed = decimalEnv(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function checkStatus(checks: ExecutionGateCheck[], id: string) {
  return checks.find((item) => item.id === id)?.status ?? "fail";
}

function branchCoverage(
  autonomy: Pick<AutonomySnapshot, "cycleHistory" | "lessons">,
) {
  const branches = new Set<string>();

  for (const cycle of autonomy.cycleHistory) {
    if (cycle.status === "no_entry" || cycle.closeReason === "no_signal") {
      branches.add("no_entry");
      continue;
    }
    if (cycle.closeReason === "target") {
      branches.add("target");
    }
    if (cycle.closeReason === "stop") {
      branches.add("stop");
    }
    if (cycle.closeReason === "timebox") {
      branches.add("timebox");
    }
  }

  return {
    branches,
    missing: ["target", "stop", "timebox", "no_entry"].filter(
      (branch) => !branches.has(branch),
    ),
  };
}

function manualEnvItem({
  env,
  id,
  label,
  envVar,
  detail,
  evidence,
}: {
  env: Record<string, string | undefined>;
  id: string;
  label: string;
  envVar: string;
  detail: string;
  evidence: string;
}) {
  const confirmed = flagEnabled(env[envVar]);

  return acceptanceItem(
    id,
    label,
    confirmed ? "pass" : "manual",
    confirmed ? `${envVar}=true is recorded.` : detail,
    confirmed ? evidence : `Set ${envVar}=true only after verification.`,
  );
}

function buildLiveAcceptanceChecklist({
  env,
  autonomy,
  checks,
  cycleCount,
  latestLessonAction,
  maxNotionalUsd,
  dailyLossLimitUsd,
}: {
  env: Record<string, string | undefined>;
  autonomy: Pick<AutonomySnapshot, "cycleHistory" | "lessons">;
  checks: ExecutionGateCheck[];
  cycleCount: number;
  latestLessonAction: string | null;
  maxNotionalUsd: number | null;
  dailyLossLimitUsd: number | null;
}): LiveAcceptanceChecklist {
  const minPaperCycles = positiveIntegerEnv(
    env.KRAKEN_SPOT_MIN_PAPER_CYCLES,
    DEFAULT_MIN_PAPER_CYCLES,
  );
  const maxDailyOrders = positiveIntegerEnv(
    env.KRAKEN_SPOT_MAX_DAILY_ORDERS,
    0,
  );
  const maxOpenOrders = positiveIntegerEnv(env.KRAKEN_SPOT_MAX_OPEN_ORDERS, 0);
  const maxSlippageBps = positiveDecimalEnv(env.KRAKEN_SPOT_MAX_SLIPPAGE_BPS);
  const { branches, missing } = branchCoverage(autonomy);
  const operatorGatePassed = checks.every(
    (item) => !item.required || item.status !== "fail",
  );
  const canaryBudgetPassed =
    maxNotionalUsd !== null &&
    maxNotionalUsd > 0 &&
    maxNotionalUsd <= MICRO_LIVE_MAX_NOTIONAL_USD &&
    dailyLossLimitUsd !== null &&
    dailyLossLimitUsd > 0 &&
    dailyLossLimitUsd <= MICRO_LIVE_DAILY_LOSS_LIMIT_USD;
  const dailyOrderCapPassed =
    maxDailyOrders > 0 && maxDailyOrders <= MICRO_LIVE_MAX_DAILY_ORDERS;
  const openOrderCapPassed =
    maxOpenOrders > 0 && maxOpenOrders <= MICRO_LIVE_MAX_OPEN_ORDERS;
  const slippageCapPassed =
    maxSlippageBps !== null &&
    maxSlippageBps > 0 &&
    maxSlippageBps <= MICRO_LIVE_MAX_SLIPPAGE_BPS;

  const groups = [
    acceptanceGroup(
      "operator-controls",
      "Operator controls",
      "Human opt-in, scoped risk, and paper-first defaults.",
      [
        acceptanceItem(
          "paper-default",
          "Paper default",
          "pass",
          "The current runner and submit API don't submit Kraken orders by default.",
          "execution-submit records submitted:false for every mode in this build.",
        ),
        acceptanceItem(
          "operator-gate",
          "Hard live gate",
          operatorGatePassed ? "pass" : "fail",
          operatorGatePassed
            ? "All explicit arming, credential, risk, allowlist, paper evidence, and kill-switch checks pass."
            : "Every hard execution gate must pass before a live canary is possible.",
          `Mode ${checkStatus(checks, "mode")}, credentials ${checkStatus(
            checks,
            "credentials",
          )}, risk ${checkStatus(checks, "max-notional")}/${checkStatus(
            checks,
            "daily-loss",
          )}.`,
        ),
        acceptanceItem(
          "micro-live-budget",
          "Micro-live budget",
          canaryBudgetPassed ? "pass" : "fail",
          canaryBudgetPassed
            ? `First canary is capped at ${maxNotionalUsd?.toFixed(
                2,
              )} USD per order and ${dailyLossLimitUsd?.toFixed(2)} USD per day.`
            : `First real-money canary must be capped at no more than ${MICRO_LIVE_MAX_NOTIONAL_USD} USD per order and ${MICRO_LIVE_DAILY_LOSS_LIMIT_USD} USD per day.`,
          maxNotionalUsd === null || dailyLossLimitUsd === null
            ? "KRAKEN_SPOT_MAX_NOTIONAL_USD and KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD are not both configured."
            : `Configured max order ${maxNotionalUsd.toFixed(
                2,
              )} USD, daily loss ${dailyLossLimitUsd.toFixed(2)} USD.`,
        ),
        acceptanceItem(
          "daily-order-cap",
          "Daily order cap",
          dailyOrderCapPassed ? "pass" : "fail",
          dailyOrderCapPassed
            ? `KRAKEN_SPOT_MAX_DAILY_ORDERS is ${maxDailyOrders}.`
            : `Set KRAKEN_SPOT_MAX_DAILY_ORDERS to 1-${MICRO_LIVE_MAX_DAILY_ORDERS} for the first canary.`,
          maxDailyOrders > 0
            ? `Configured daily order cap: ${maxDailyOrders}.`
            : "No daily order cap is configured.",
        ),
      ],
    ),
    acceptanceGroup(
      "strategy-evidence",
      "Strategy evidence",
      "Paper cycles must cover the branches the live bot can hit.",
      [
        acceptanceItem(
          "paper-cycle-count",
          "Paper cycle count",
          cycleCount >= minPaperCycles ? "pass" : "fail",
          cycleCount >= minPaperCycles
            ? `${cycleCount} paper cycles meet the ${minPaperCycles}-cycle minimum.`
            : `Run at least ${minPaperCycles} paper cycles before first live order.`,
          `KRAKEN_SPOT_MIN_PAPER_CYCLES=${minPaperCycles}.`,
        ),
        acceptanceItem(
          "branch-coverage",
          "Branch coverage",
          missing.length === 0 ? "pass" : "fail",
          missing.length === 0
            ? "Target, stop, timebox, and no-entry branches are represented."
            : `Rehearse missing branches before live: ${missing.join(", ")}.`,
          branches.size > 0
            ? `Observed branches: ${Array.from(branches).join(", ")}.`
            : "No completed branch evidence is recorded.",
        ),
        acceptanceItem(
          "latest-feedback",
          "Feedback loop",
          latestLessonAction !== null ? "pass" : "fail",
          latestLessonAction !== null
            ? "The latest cycle wrote a lesson for the next strategy slate."
            : "The latest cycle must write a lesson before live mode.",
          latestLessonAction,
        ),
        manualEnvItem({
          env,
          id: "paper-profitability-review",
          label: "Paper performance review",
          envVar: "KRAKEN_SPOT_PAPER_REVIEW_APPROVED",
          detail:
            "Approve a paper performance report that includes fees, slippage assumptions, drawdown, and branch-level outcomes.",
          evidence:
            "Paper performance review approved outside the dashboard artifact stream.",
        }),
      ],
    ),
    acceptanceGroup(
      "exchange-preflight",
      "Exchange preflight",
      "Private Kraken checks must be verified without logging secrets.",
      [
        manualEnvItem({
          env,
          id: "api-key-permissions",
          label: "API key permissions",
          envVar: "KRAKEN_SPOT_PREFLIGHT_PERMISSIONS_OK",
          detail:
            "Verify the key can query account state and create, modify, cancel, or close Spot orders.",
          evidence:
            "Kraken key permission preflight was confirmed without exposing key material.",
        }),
        manualEnvItem({
          env,
          id: "balances",
          label: "Balances",
          envVar: "KRAKEN_SPOT_PREFLIGHT_BALANCES_OK",
          detail:
            "Verify quote-currency balances are enough for the canary and no unintended assets are exposed.",
          evidence: "Balance preflight was confirmed.",
        }),
        manualEnvItem({
          env,
          id: "asset-pairs",
          label: "Asset pairs",
          envVar: "KRAKEN_SPOT_PREFLIGHT_ASSET_PAIRS_OK",
          detail:
            "Verify allowlisted pairs, price precision, quantity precision, order minimums, and leverage settings from AssetPairs.",
          evidence: "AssetPairs preflight was confirmed.",
        }),
        manualEnvItem({
          env,
          id: "cost-minimums",
          label: "Cost minimums",
          envVar: "KRAKEN_SPOT_PREFLIGHT_COST_MINIMUMS_OK",
          detail:
            "Verify canary order sizes clear Kraken quote-currency cost minimums before submission.",
          evidence: "Cost minimum preflight was confirmed.",
        }),
        manualEnvItem({
          env,
          id: "rate-limits",
          label: "Rate limits",
          envVar: "KRAKEN_SPOT_PREFLIGHT_RATE_LIMITS_OK",
          detail:
            "Verify submit, cancel, and polling cadence stays below Kraken REST and matching-engine limits.",
          evidence: "Rate-limit preflight was confirmed.",
        }),
      ],
    ),
    acceptanceGroup(
      "execution-safety",
      "Execution safety",
      "The submitter must be small, auditable, and reversible.",
      [
        acceptanceItem(
          "live-submitter",
          "Live submitter",
          "fail",
          "The current live path only records a Nautilus command descriptor; it never submits orders.",
          "live-executor.ts records submissionAllowed:false and submitterImplemented:false.",
        ),
        acceptanceItem(
          "live-reconciliation",
          "Live reconciliation",
          "fail",
          "Live fills, fees, slippage, order IDs, and realized PnL must be persisted before postmortem handoff.",
          "execution-submit currently writes dry-run fill records or not-submitted placeholders.",
        ),
        acceptanceItem(
          "kill-switch-flatten",
          "Kill switch exit",
          "fail",
          "The kill switch must cancel open orders and flatten tracked live Spot exposure, not only block new submissions.",
          "Current kill switch gate blocks live readiness but does not call Kraken cancel endpoints.",
        ),
        acceptanceItem(
          "open-order-cap",
          "Open order cap",
          openOrderCapPassed ? "pass" : "fail",
          openOrderCapPassed
            ? `KRAKEN_SPOT_MAX_OPEN_ORDERS is ${maxOpenOrders}.`
            : `Set KRAKEN_SPOT_MAX_OPEN_ORDERS to 1-${MICRO_LIVE_MAX_OPEN_ORDERS} and enforce it in the submitter.`,
          maxOpenOrders > 0
            ? `Configured open order cap: ${maxOpenOrders}.`
            : "No open order cap is configured.",
        ),
        acceptanceItem(
          "slippage-cap",
          "Slippage cap",
          slippageCapPassed ? "pass" : "fail",
          slippageCapPassed
            ? `KRAKEN_SPOT_MAX_SLIPPAGE_BPS is ${maxSlippageBps?.toFixed(1)}.`
            : `Set KRAKEN_SPOT_MAX_SLIPPAGE_BPS to 1-${MICRO_LIVE_MAX_SLIPPAGE_BPS} and reject fills beyond it.`,
          maxSlippageBps === null
            ? "No slippage cap is configured."
            : `Configured slippage cap: ${maxSlippageBps.toFixed(1)} bps.`,
        ),
      ],
    ),
    acceptanceGroup(
      "operations-ramp",
      "Operations ramp",
      "Promotion to passive mode requires proof from tiny live canaries.",
      [
        manualEnvItem({
          env,
          id: "monitoring",
          label: "Monitoring",
          envVar: "KRAKEN_SPOT_LIVE_MONITORING_OK",
          detail:
            "Verify dashboard health, artifact writes, process supervision, and alerting from another machine.",
          evidence: "Live monitoring preflight was confirmed.",
        }),
        manualEnvItem({
          env,
          id: "rollback-drill",
          label: "Rollback drill",
          envVar: "KRAKEN_SPOT_LIVE_ROLLBACK_DRILLED",
          detail:
            "Drill restart, disable live env flags, activate kill switch, cancel orders, and confirm no open exposure.",
          evidence: "Rollback drill was confirmed.",
        }),
        manualEnvItem({
          env,
          id: "canary-review",
          label: "Canary review",
          envVar: "KRAKEN_SPOT_CANARY_REVIEW_APPROVED",
          detail:
            "After micro-live runs, approve a review of actual fills, fees, slippage, errors, and lessons.",
          evidence: "Micro-live canary review was approved.",
        }),
      ],
    ),
  ];
  const requiredItems = groups.flatMap((group) =>
    group.items.filter((item) => item.required),
  );
  const passedRequiredItems = requiredItems.filter(
    (item) => item.status === "pass",
  );
  const manualItems = requiredItems.filter((item) => item.status === "manual");
  const failedItems = requiredItems.filter((item) => item.status === "fail");
  const blockingItems = requiredItems.length - passedRequiredItems.length;

  return {
    summary: {
      requiredItems: requiredItems.length,
      passedRequiredItems: passedRequiredItems.length,
      blockingItems,
      manualItems: manualItems.length,
      failedItems: failedItems.length,
      statusLabel:
        blockingItems === 0
          ? "Go-live acceptance is complete for a micro-live Kraken Spot canary."
          : `Go-live remains blocked by ${blockingItems} required acceptance items.`,
    },
    groups,
  };
}

export function buildExecutionReadinessSnapshot(
  env: Record<string, string | undefined>,
  autonomy: Pick<AutonomySnapshot, "cycleHistory" | "lessons">,
  generatedAt = Date.now(),
): ExecutionReadinessSnapshot {
  const apiKeyPresent = Boolean(env.KRAKEN_SPOT_API_KEY?.trim());
  const apiSecretPresent = Boolean(env.KRAKEN_SPOT_API_SECRET?.trim());
  const maxNotionalUsd = decimalEnv(env.KRAKEN_SPOT_MAX_NOTIONAL_USD);
  const dailyLossLimitUsd = decimalEnv(env.KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD);
  const allowlist = symbolAllowlist(env.KRAKEN_SPOT_SYMBOL_ALLOWLIST);
  const killSwitchActive = flagEnabled(env.KRAKEN_SPOT_LIVE_KILL_SWITCH);
  const liveArmed = flagEnabled(env.KRAKEN_SPOT_LIVE_ARMED);
  const confirmPhrase = env.KRAKEN_SPOT_LIVE_CONFIRM?.trim() ?? "";
  const cycleCount = autonomy.cycleHistory.length;
  const latestCycle = autonomy.cycleHistory[0] ?? null;
  const latestLesson = autonomy.lessons[0] ?? null;
  const paperLoopProven = cycleCount >= 4 && latestLesson !== null;

  const checks = [
    check(
      "mode",
      "Live mode flag",
      liveArmed ? "pass" : "fail",
      liveArmed
        ? "KRAKEN_SPOT_LIVE_ARMED is enabled."
        : "Set KRAKEN_SPOT_LIVE_ARMED=true only when you intend to allow live order submission.",
    ),
    check(
      "confirm",
      "Operator confirmation",
      confirmPhrase === LIVE_CONFIRM_PHRASE ? "pass" : "fail",
      confirmPhrase === LIVE_CONFIRM_PHRASE
        ? "Operator risk confirmation phrase is present."
        : `Set KRAKEN_SPOT_LIVE_CONFIRM=${LIVE_CONFIRM_PHRASE} before live mode can be armed.`,
    ),
    check(
      "credentials",
      "Kraken Spot credentials",
      apiKeyPresent && apiSecretPresent ? "pass" : "fail",
      apiKeyPresent && apiSecretPresent
        ? "KRAKEN_SPOT_API_KEY and KRAKEN_SPOT_API_SECRET are present; values are not exposed."
        : "KRAKEN_SPOT_API_KEY and KRAKEN_SPOT_API_SECRET must both be present.",
    ),
    check(
      "kill-switch",
      "Kill switch",
      killSwitchActive ? "fail" : "pass",
      killSwitchActive
        ? "KRAKEN_SPOT_LIVE_KILL_SWITCH is active; live orders must stay blocked."
        : "Kill switch is clear.",
    ),
    check(
      "max-notional",
      "Max order notional",
      maxNotionalUsd !== null && maxNotionalUsd > 0 && maxNotionalUsd <= 100
        ? "pass"
        : "fail",
      maxNotionalUsd !== null
        ? `Max order notional is ${maxNotionalUsd.toFixed(2)} USD; required range is 0-100 USD.`
        : "Set KRAKEN_SPOT_MAX_NOTIONAL_USD to a positive value no greater than 100.",
    ),
    check(
      "daily-loss",
      "Daily loss limit",
      dailyLossLimitUsd !== null &&
        dailyLossLimitUsd > 0 &&
        dailyLossLimitUsd <= 250
        ? "pass"
        : "fail",
      dailyLossLimitUsd !== null
        ? `Daily loss limit is ${dailyLossLimitUsd.toFixed(2)} USD; required range is 0-250 USD.`
        : "Set KRAKEN_SPOT_DAILY_LOSS_LIMIT_USD to a positive value no greater than 250.",
    ),
    check(
      "allowlist",
      "Symbol allowlist",
      allowlist.length > 0 && !allowlist.includes("*") ? "pass" : "fail",
      allowlist.length > 0 && !allowlist.includes("*")
        ? `Allowed symbols: ${allowlist.join(", ")}.`
        : "Set KRAKEN_SPOT_SYMBOL_ALLOWLIST to explicit symbols such as BTC/USDT,ETH/USDT.",
    ),
    check(
      "paper-evidence",
      "Paper loop evidence",
      paperLoopProven ? "pass" : "fail",
      paperLoopProven
        ? `${cycleCount} paper cycles are recorded, with a latest lesson ready for strategy feedback.`
        : "Run the paper loop until at least four completed cycles and a lesson are recorded.",
    ),
  ];

  const latestLessonAction =
    latestLesson?.action ?? latestCycle?.lessonAction ?? null;
  const liveBlocked = checks.some(
    (item) => item.required && item.status === "fail",
  );
  const acceptance = buildLiveAcceptanceChecklist({
    env,
    autonomy,
    checks,
    cycleCount,
    latestLessonAction,
    maxNotionalUsd,
    dailyLossLimitUsd,
  });

  return {
    generatedAt,
    venue: "KRAKEN",
    productType: "SPOT",
    executionMode: liveBlocked ? "paper" : "live-ready",
    liveBlocked,
    statusLabel: liveBlocked
      ? "Live Kraken Spot is blocked; paper mode remains enforced."
      : "Live Kraken Spot gate is ready, but order submission still requires the live executor.",
    credentials: {
      apiKeyPresent,
      apiSecretPresent,
    },
    risk: {
      maxNotionalUsd,
      dailyLossLimitUsd,
      symbolAllowlist: allowlist,
    },
    evidence: {
      cycleCount,
      latestCycleId: latestCycle?.cycleId ?? null,
      latestLessonAction,
    },
    checks,
    acceptance,
  };
}
