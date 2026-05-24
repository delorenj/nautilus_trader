import {
  MARKET_FIXTURES,
  STABLE_WALLET_COUNT,
  WALLET_PSEUDONYMS,
  type MockMarketFixture,
  type MockOutcomeFixture,
} from "./fixtures";
import {
  mulberry32,
  randomAddress,
  randomChoice,
  randomDecimal,
  randomHex,
  randomInt,
} from "./random";
import type {
  Side,
  SignalKey,
  StreamEvent,
  WhaleSignal,
  WhaleTrade,
} from "../stream/types";

export type CreateMockStreamOptions = {
  onEvent: (event: StreamEvent) => void;
  signalIntervalMs?: number;
  tradeIntervalMs?: number;
  heartbeatIntervalMs?: number;
  walletCount?: number;
  maxSignalAgeSecs?: number;
  seed?: number;
  scheduler?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
    now: () => number;
  };
};

export interface MockStream {
  start(): void;
  stop(): void;
}

type MockWallet = {
  address: string;
  pseudonym: string;
};

type LiveSignal = {
  signal: WhaleSignal;
  updatedAt: number;
};

type IntervalHandles = {
  trade: unknown;
  signal: unknown;
  heartbeat: unknown;
};

const DEFAULT_SIGNAL_INTERVAL_MS = 2_000;
const DEFAULT_TRADE_INTERVAL_MS = 500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_SIGNAL_AGE_SECS = 120;
const SIDES = ["BUY", "SELL"] as const;

const defaultScheduler = {
  setInterval: (cb: () => void, ms: number) => globalThis.setInterval(cb, ms),
  clearInterval: (handle: unknown) =>
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
  now: () => Date.now(),
};

export function createMockStream(opts: CreateMockStreamOptions): MockStream {
  const scheduler = opts.scheduler ?? defaultScheduler;
  const signalIntervalMs = positiveInterval(
    opts.signalIntervalMs,
    DEFAULT_SIGNAL_INTERVAL_MS,
  );
  const tradeIntervalMs = positiveInterval(
    opts.tradeIntervalMs,
    DEFAULT_TRADE_INTERVAL_MS,
  );
  const heartbeatIntervalMs = positiveInterval(
    opts.heartbeatIntervalMs,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
  );
  const maxSignalAgeMs =
    positiveNumber(opts.maxSignalAgeSecs, DEFAULT_MAX_SIGNAL_AGE_SECS) * 1_000;
  const walletCount = clampWalletCount(opts.walletCount);
  const seed = normalizeSeed(opts.seed ?? Date.now());

  let handles: IntervalHandles | null = null;
  let rng = mulberry32(seed);
  let wallets: MockWallet[] = [];
  let liveSignals = new Map<string, LiveSignal>();
  let startedAt = 0;

  function start(): void {
    if (handles !== null) {
      return;
    }

    rng = mulberry32(seed);
    wallets = createWallets(rng, walletCount);
    liveSignals = new Map<string, LiveSignal>();
    startedAt = scheduler.now();

    handles = {
      trade: scheduler.setInterval(emitTradeTick, tradeIntervalMs),
      signal: scheduler.setInterval(expireStaleSignals, signalIntervalMs),
      heartbeat: scheduler.setInterval(emitHeartbeat, heartbeatIntervalMs),
    };
  }

  function stop(): void {
    if (handles === null) {
      return;
    }

    scheduler.clearInterval(handles.trade);
    scheduler.clearInterval(handles.signal);
    scheduler.clearInterval(handles.heartbeat);
    handles = null;
  }

  function emitTradeTick(): void {
    const now = scheduler.now();
    const wallet = randomChoice(rng, wallets);
    const market = randomChoice(rng, MARKET_FIXTURES);
    const outcome = randomChoice(rng, market.outcomes);
    const side = randomChoice(rng, SIDES);
    const trade = createTrade(now, wallet, market, outcome, side);

    opts.onEvent({
      type: "trade.whale",
      t: now,
      data: trade,
    });

    if (rng() < 0.7) {
      const signal = upsertSignal(now, trade, market, outcome, side);
      opts.onEvent({
        type: "signal.upsert",
        t: now,
        data: signal,
      });
    }
  }

  function createTrade(
    now: number,
    wallet: MockWallet,
    market: MockMarketFixture,
    outcome: MockOutcomeFixture,
    side: Side,
  ): WhaleTrade {
    const price = randomDecimal(rng, 0.02, 0.98, 3);
    const notional = randomDecimal(rng, 125, 8_500, 2);
    const size = decimalFromNumber(Number(notional) / Number(price), 4);

    return {
      wallet: wallet.address,
      side,
      asset_id: outcome.assetId,
      condition_id: market.conditionId,
      size,
      price,
      notional,
      timestamp: Math.trunc(now),
      title: market.title,
      slug: market.slug,
      event_slug: market.eventSlug,
      outcome: outcome.outcome,
      outcome_index: outcome.outcomeIndex,
      name: wallet.pseudonym,
      pseudonym: wallet.pseudonym,
      transaction_hash: `0x${randomHex(rng, 64)}`,
    };
  }

  function upsertSignal(
    now: number,
    trade: WhaleTrade,
    market: MockMarketFixture,
    outcome: MockOutcomeFixture,
    side: Side,
  ): WhaleSignal {
    const key = signalKey(trade);
    const existing = liveSignals.get(key);
    const existingWallets = existing?.signal.wallets ?? [];
    const walletsForSignal = existingWallets.includes(trade.wallet)
      ? existingWallets
      : [...existingWallets, trade.wallet];
    const tradeCount = (existing?.signal.trade_count ?? 0) + 1;
    const scoreNotional = decimalFromNumber(
      Number(existing?.signal.score_notional ?? "0") + Number(trade.notional),
      2,
    );
    const suggestedNotional = decimalFromNumber(
      Math.min(Number(scoreNotional), 5_000),
      2,
    );

    const signal: WhaleSignal = {
      condition_id: market.conditionId,
      asset_id: outcome.assetId,
      instrument_id: `${market.conditionId}:${outcome.assetId}`,
      side,
      score_notional: scoreNotional,
      suggested_notional: suggestedNotional,
      reference_price: trade.price,
      trade_count: tradeCount,
      latest_timestamp: Math.trunc(now),
      wallets: walletsForSignal,
      title: market.title,
      slug: market.slug,
      event_slug: market.eventSlug,
      outcome: outcome.outcome,
    };

    liveSignals.set(key, { signal, updatedAt: now });
    return signal;
  }

  function expireStaleSignals(): void {
    const now = scheduler.now();

    for (const [key, liveSignal] of liveSignals) {
      if (now - liveSignal.updatedAt <= maxSignalAgeMs) {
        continue;
      }

      const expireKey: SignalKey = {
        condition_id: liveSignal.signal.condition_id,
        asset_id: liveSignal.signal.asset_id,
      };
      liveSignals.delete(key);
      opts.onEvent({
        type: "signal.expire",
        t: now,
        data: expireKey,
      });
    }
  }

  function emitHeartbeat(): void {
    const now = scheduler.now();

    opts.onEvent({
      type: "heartbeat",
      t: now,
      data: {
        clob_ms: randomInt(rng, 80, 180),
        data_api_ms: randomInt(rng, 200, 420),
        signal_count: liveSignals.size,
        watched_wallets: walletCount,
        live_trading_enabled: false,
        bridge_uptime_secs: Math.max(0, (now - startedAt) / 1_000),
      },
    });
  }

  return { start, stop };
}

function createWallets(rng: () => number, walletCount: number): MockWallet[] {
  return WALLET_PSEUDONYMS.slice(0, walletCount).map((pseudonym) => ({
    address: randomAddress(rng),
    pseudonym,
  }));
}

function clampWalletCount(walletCount: number | undefined): number {
  const requested = Math.trunc(walletCount ?? STABLE_WALLET_COUNT);
  return Math.max(1, Math.min(requested, WALLET_PSEUDONYMS.length));
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    return 0;
  }

  return Math.trunc(seed) >>> 0;
}

function positiveInterval(value: number | undefined, fallback: number): number {
  const interval = value ?? fallback;
  return Number.isFinite(interval) && interval > 0 ? interval : fallback;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  return Number.isFinite(resolved) && resolved >= 0 ? resolved : fallback;
}

function decimalFromNumber(value: number, precision: number): string {
  return value.toFixed(precision);
}

function signalKey(trade: Pick<WhaleTrade, "condition_id" | "asset_id">): string {
  return `${trade.condition_id}:${trade.asset_id}`;
}
