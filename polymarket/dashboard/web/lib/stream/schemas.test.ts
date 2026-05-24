import { describe, expect, it } from "vitest";

import {
  BookDelta,
  Decimalish,
  Heartbeat,
  StreamEvent,
  WhalePosition,
  WhaleSignal,
  WhaleTrade,
} from "./schemas";

const whaleTrade = {
  wallet: "0xwallet",
  side: "BUY",
  asset_id: "asset-1",
  condition_id: "condition-1",
  size: "10.25",
  price: "0.42",
  notional: "4.305",
  timestamp: 1_714_000_000,
  title: "Will it rain?",
  slug: "will-it-rain",
  event_slug: "weather",
  outcome: "Yes",
  outcome_index: 0,
  name: "Alice",
  pseudonym: "whale-one",
  transaction_hash: "0xtx",
};

const whaleSignal = {
  condition_id: "condition-1",
  asset_id: "asset-1",
  instrument_id: "instrument-1",
  side: "SELL",
  score_notional: "100.00",
  suggested_notional: "25",
  reference_price: "0.58",
  trade_count: 3,
  latest_timestamp: 1_714_000_123,
  wallets: ["0xwallet", "0xwallet2"],
  title: null,
  slug: "market-slug",
  event_slug: "event-slug",
  outcome: "No",
};

const signalKey = {
  condition_id: "condition-1",
  asset_id: "asset-1",
};

const bookDelta = {
  asset_id: "asset-1",
  bids: [
    ["0.41", "100"],
    ["0.40", "200.5"],
  ],
  asks: [["0.43", "50"]],
  snapshot: true,
};

const whalePosition = {
  wallet: "0xwallet",
  asset_id: "asset-1",
  condition_id: "condition-1",
  size: "15",
  avg_price: "0.40",
  current_value: "6",
  cur_price: "0.42",
  cash_pnl: "0.30",
  percent_pnl: "5.0",
  realized_pnl: "1.25",
  redeemable: false,
  title: "Will it rain?",
  slug: "will-it-rain",
  event_slug: "weather",
  outcome: "Yes",
};

const heartbeat = {
  clob_ms: 12.4,
  data_api_ms: 34.1,
  signal_count: 2,
  watched_wallets: 42,
  live_trading_enabled: false,
  bridge_uptime_secs: 99.8,
};

describe("stream schemas", () => {
  it("validates every event variant", () => {
    const events = [
      { type: "trade.whale", t: 1, data: whaleTrade },
      { type: "signal.upsert", t: 2, data: whaleSignal },
      { type: "signal.expire", t: 3, data: signalKey },
      { type: "book.delta", t: 4, data: bookDelta },
      { type: "position.update", t: 5, data: whalePosition },
      { type: "heartbeat", t: 6, data: heartbeat },
    ];

    for (const event of events) {
      expect(StreamEvent.parse(event)).toEqual(event);
    }
  });

  it("exports payload schemas directly", () => {
    expect(WhaleTrade.parse(whaleTrade)).toEqual(whaleTrade);
    expect(WhaleSignal.parse(whaleSignal)).toEqual(whaleSignal);
    expect(BookDelta.parse(bookDelta)).toEqual(bookDelta);
    expect(WhalePosition.parse(whalePosition)).toEqual(whalePosition);
    expect(Heartbeat.parse(heartbeat)).toEqual(heartbeat);
  });

  it("rejects NaN values", () => {
    expect(() =>
      StreamEvent.parse({ type: "heartbeat", t: Number.NaN, data: heartbeat }),
    ).toThrow();
    expect(() =>
      StreamEvent.parse({
        type: "trade.whale",
        t: 1,
        data: { ...whaleTrade, timestamp: Number.NaN },
      }),
    ).toThrow();
  });

  it("rejects missing fields", () => {
    const { wallet, ...tradeWithoutWallet } = whaleTrade;
    const { signal_count, ...heartbeatWithoutSignalCount } = heartbeat;

    expect(wallet).toBe("0xwallet");
    expect(signal_count).toBe(2);
    expect(() => WhaleTrade.parse(tradeWithoutWallet)).toThrow();
    expect(() => Heartbeat.parse(heartbeatWithoutSignalCount)).toThrow();
  });

  it("rejects wrong-typed t and timestamp fields", () => {
    expect(() =>
      StreamEvent.parse({ type: "heartbeat", t: "1", data: heartbeat }),
    ).toThrow();
    expect(() =>
      StreamEvent.parse({
        type: "trade.whale",
        t: 1,
        data: { ...whaleTrade, timestamp: "1714000000" },
      }),
    ).toThrow();
  });

  it("rejects bad decimal strings", () => {
    expect(() => Decimalish.parse("NaN")).toThrow();
    expect(() => Decimalish.parse("1.")).toThrow();
    expect(() => Decimalish.parse("")).toThrow();
    expect(() =>
      StreamEvent.parse({
        type: "book.delta",
        t: 1,
        data: { ...bookDelta, bids: [["bad", "100"]] },
      }),
    ).toThrow();
    expect(() =>
      StreamEvent.parse({
        type: "position.update",
        t: 1,
        data: { ...whalePosition, cash_pnl: "$1.00" },
      }),
    ).toThrow();
  });
});
