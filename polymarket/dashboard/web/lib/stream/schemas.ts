import { z } from "zod";

export const Decimalish = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a decimal string");

export const Side = z.enum(["BUY", "SELL"]);

export const WhaleTrade = z.object({
  wallet: z.string(),
  side: Side,
  asset_id: z.string(),
  condition_id: z.string(),
  size: Decimalish,
  price: Decimalish,
  notional: Decimalish,
  timestamp: z.number().int().nonnegative(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  event_slug: z.string().nullable(),
  outcome: z.string().nullable(),
  outcome_index: z.number().int().nullable(),
  name: z.string().nullable(),
  pseudonym: z.string().nullable(),
  transaction_hash: z.string().nullable(),
});

export const WhaleSignal = z.object({
  condition_id: z.string(),
  asset_id: z.string(),
  instrument_id: z.string(),
  side: Side,
  score_notional: Decimalish,
  suggested_notional: Decimalish,
  reference_price: Decimalish,
  trade_count: z.number().int().nonnegative(),
  latest_timestamp: z.number().int().nonnegative(),
  wallets: z.array(z.string()),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  event_slug: z.string().nullable(),
  outcome: z.string().nullable(),
});

export const SignalKey = WhaleSignal.pick({
  condition_id: true,
  asset_id: true,
});

export const BookLevel = z.tuple([Decimalish, Decimalish]);

export const BookDelta = z.object({
  asset_id: z.string(),
  bids: z.array(BookLevel),
  asks: z.array(BookLevel),
  snapshot: z.boolean(),
});

export const WhalePosition = z.object({
  wallet: z.string(),
  asset_id: z.string(),
  condition_id: z.string(),
  size: Decimalish,
  avg_price: Decimalish,
  current_value: Decimalish,
  cur_price: Decimalish,
  cash_pnl: Decimalish,
  percent_pnl: Decimalish,
  realized_pnl: Decimalish,
  redeemable: z.boolean(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  event_slug: z.string().nullable(),
  outcome: z.string().nullable(),
});

export const Heartbeat = z.object({
  clob_ms: z.number().nonnegative(),
  data_api_ms: z.number().nonnegative(),
  signal_count: z.number().int().nonnegative(),
  watched_wallets: z.number().int().nonnegative(),
  live_trading_enabled: z.boolean(),
  bridge_uptime_secs: z.number().nonnegative(),
});

export const StreamEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trade.whale"),
    t: z.number(),
    data: WhaleTrade,
  }),
  z.object({
    type: z.literal("signal.upsert"),
    t: z.number(),
    data: WhaleSignal,
  }),
  z.object({
    type: z.literal("signal.expire"),
    t: z.number(),
    data: SignalKey,
  }),
  z.object({
    type: z.literal("book.delta"),
    t: z.number(),
    data: BookDelta,
  }),
  z.object({
    type: z.literal("position.update"),
    t: z.number(),
    data: WhalePosition,
  }),
  z.object({
    type: z.literal("heartbeat"),
    t: z.number(),
    data: Heartbeat,
  }),
]);
