import type {
  ExecutionIntentSnapshot,
  KrakenSpotOrderIntent,
} from "./execution-intent";
import type { ExecutionReadinessSnapshot } from "./live-readiness";

export const KRAKEN_SPOT_EXECUTOR_CONFIRM_PHRASE =
  "I_ACCEPT_KRAKEN_SPOT_LIVE_ORDER_SUBMISSION";

export interface KrakenSpotCredentialSource {
  apiKeyEnv: "KRAKEN_SPOT_API_KEY";
  apiSecretEnv: "KRAKEN_SPOT_API_SECRET";
  apiKeyPresent: boolean;
  apiSecretPresent: boolean;
  secretPolicy: "env-only-redacted";
}

export interface KrakenSpotNautilusClientConfigDescriptor {
  adapter: "KrakenLiveExecClientFactory";
  configClass: "KrakenExecClientConfig";
  environment: "LIVE";
  productTypes: ["SPOT"];
  spotAccountType: "CASH";
  useSpotPositionReports: true;
  spotPositionsQuoteCurrency: string;
  credentialSource: KrakenSpotCredentialSource;
}

export interface KrakenSpotNautilusOrderCommand {
  role: KrakenSpotOrderIntent["role"];
  clientOrderId: string;
  instrumentId: string;
  symbol: string;
  side: KrakenSpotOrderIntent["side"];
  orderType: KrakenSpotOrderIntent["orderType"];
  timeInForce: KrakenSpotOrderIntent["timeInForce"];
  quoteNotionalUsd: number | null;
  baseQuantity: number | null;
  limitPrice: number | null;
  triggerPrice: number | null;
  reduceOnly: false;
  nautilus: {
    instrumentId: string;
    orderSide: KrakenSpotOrderIntent["side"];
    orderType: KrakenSpotOrderIntent["orderType"];
    timeInForce: KrakenSpotOrderIntent["timeInForce"];
    accountType: "CASH";
  };
}

export interface KrakenSpotLiveCommandDescriptor {
  schemaVersion: "kraken_spot.nautilus_live_command.v1";
  generatedAt: number;
  venue: "KRAKEN";
  productType: "SPOT";
  cycleId: string | null;
  signalId: string | null;
  strategyId: string | null;
  submissionAllowed: false;
  submitterImplemented: false;
  safetyBoundary: "descriptor-only";
  clientConfig: KrakenSpotNautilusClientConfigDescriptor;
  risk: {
    maxOrderNotionalUsd: number | null;
    dailyLossLimitUsd: number | null;
    symbolAllowlist: string[];
  };
  entry: KrakenSpotNautilusOrderCommand;
  exits: KrakenSpotNautilusOrderCommand[];
  requiredSubmitterEnv: {
    executorEnabled: "KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED";
    executorConfirm: "KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM";
    executorConfirmPhrase: typeof KRAKEN_SPOT_EXECUTOR_CONFIRM_PHRASE;
  };
  reconciliationContract: {
    requiredBeforeExit: ["krakenOrderId", "acceptedAt", "filledQuantity"];
    requiredBeforePostmortem: [
      "averageFillPrice",
      "feeAmount",
      "feeCurrency",
      "slippageBps",
      "realizedPnlUsd",
    ];
  };
  notes: string[];
}

function flagEnabled(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function quoteCurrency(symbol: string) {
  return symbol.split("/")[1]?.trim().toUpperCase() || "USDT";
}

function orderCommand(
  intent: KrakenSpotOrderIntent,
): KrakenSpotNautilusOrderCommand {
  return {
    role: intent.role,
    clientOrderId: intent.clientOrderId,
    instrumentId: intent.instrumentId,
    symbol: intent.symbol,
    side: intent.side,
    orderType: intent.orderType,
    timeInForce: intent.timeInForce,
    quoteNotionalUsd: intent.quoteNotionalUsd,
    baseQuantity: intent.baseQuantity,
    limitPrice: intent.limitPrice,
    triggerPrice: intent.triggerPrice,
    reduceOnly: false,
    nautilus: {
      instrumentId: intent.instrumentId,
      orderSide: intent.side,
      orderType: intent.orderType,
      timeInForce: intent.timeInForce,
      accountType: "CASH",
    },
  };
}

export function krakenSpotExecutorArmed(env: Record<string, string | undefined>) {
  return flagEnabled(env.KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED);
}

export function krakenSpotExecutorConfirmed(
  env: Record<string, string | undefined>,
) {
  return (
    env.KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM?.trim() ===
    KRAKEN_SPOT_EXECUTOR_CONFIRM_PHRASE
  );
}

export function buildKrakenSpotLiveCommandDescriptor({
  intent,
  readiness,
  generatedAt = Date.now(),
}: {
  intent: ExecutionIntentSnapshot;
  readiness: ExecutionReadinessSnapshot;
  generatedAt?: number;
}): KrakenSpotLiveCommandDescriptor | null {
  if (intent.entry === null) {
    return null;
  }

  return {
    schemaVersion: "kraken_spot.nautilus_live_command.v1",
    generatedAt,
    venue: "KRAKEN",
    productType: "SPOT",
    cycleId: intent.cycleId,
    signalId: intent.signalId,
    strategyId: intent.strategyId,
    submissionAllowed: false,
    submitterImplemented: false,
    safetyBoundary: "descriptor-only",
    clientConfig: {
      adapter: "KrakenLiveExecClientFactory",
      configClass: "KrakenExecClientConfig",
      environment: "LIVE",
      productTypes: ["SPOT"],
      spotAccountType: "CASH",
      useSpotPositionReports: true,
      spotPositionsQuoteCurrency: quoteCurrency(intent.entry.symbol),
      credentialSource: {
        apiKeyEnv: "KRAKEN_SPOT_API_KEY",
        apiSecretEnv: "KRAKEN_SPOT_API_SECRET",
        apiKeyPresent: readiness.credentials.apiKeyPresent,
        apiSecretPresent: readiness.credentials.apiSecretPresent,
        secretPolicy: "env-only-redacted",
      },
    },
    risk: {
      maxOrderNotionalUsd: readiness.risk.maxNotionalUsd,
      dailyLossLimitUsd: readiness.risk.dailyLossLimitUsd,
      symbolAllowlist: readiness.risk.symbolAllowlist,
    },
    entry: orderCommand(intent.entry),
    exits: intent.exits.map(orderCommand),
    requiredSubmitterEnv: {
      executorEnabled: "KRAKEN_SPOT_LIVE_EXECUTOR_ENABLED",
      executorConfirm: "KRAKEN_SPOT_LIVE_EXECUTOR_CONFIRM",
      executorConfirmPhrase: KRAKEN_SPOT_EXECUTOR_CONFIRM_PHRASE,
    },
    reconciliationContract: {
      requiredBeforeExit: ["krakenOrderId", "acceptedAt", "filledQuantity"],
      requiredBeforePostmortem: [
        "averageFillPrice",
        "feeAmount",
        "feeCurrency",
        "slippageBps",
        "realizedPnlUsd",
      ],
    },
    notes: [
      "Descriptor matches KrakenExecClientConfig for live Kraken Spot CASH trading.",
      "Kraken Spot has no demo environment, so this descriptor remains non-submitting until a live submitter is implemented.",
      "Exit orders must not be armed until the live entry fill is reconciled.",
    ],
  };
}
