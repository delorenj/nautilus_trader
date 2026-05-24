import { beforeEach, describe, expect, it } from "vitest";

import type { WhaleTrade } from "../stream/types";
import { selectTape, selectTapeForWallet, useTapeStore } from "./tape-store";

const trade = (overrides: Partial<WhaleTrade>): WhaleTrade => ({
  wallet: "0xaaa",
  side: "BUY",
  asset_id: "asset-a",
  condition_id: "condition-a",
  size: "10",
  price: "0.50",
  notional: "5",
  timestamp: 1,
  title: null,
  slug: null,
  event_slug: null,
  outcome: null,
  outcome_index: null,
  name: null,
  pseudonym: null,
  transaction_hash: null,
  ...overrides,
});

describe("tape-store", () => {
  beforeEach(() => {
    useTapeStore.setState({ trades: [], cap: 2_000 });
  });

  it("keeps newest trades first and trims past cap", () => {
    useTapeStore.setState({ trades: [], cap: 3 });

    useTapeStore.getState().append(trade({ timestamp: 1 }));
    useTapeStore.getState().append(trade({ timestamp: 2 }));
    useTapeStore.getState().append(trade({ timestamp: 3 }));
    useTapeStore.getState().append(trade({ timestamp: 4 }));

    expect(selectTape()(useTapeStore.getState()).map((item) => item.timestamp)).toEqual([4, 3, 2]);
  });

  it("selects a limited tape", () => {
    useTapeStore.getState().append(trade({ timestamp: 1 }));
    useTapeStore.getState().append(trade({ timestamp: 2 }));

    expect(selectTape(1)(useTapeStore.getState()).map((item) => item.timestamp)).toEqual([2]);
  });

  it("filters trades by wallet", () => {
    useTapeStore.getState().append(trade({ wallet: "0xaaa", timestamp: 1 }));
    useTapeStore.getState().append(trade({ wallet: "0xbbb", timestamp: 2 }));
    useTapeStore.getState().append(trade({ wallet: "0xaaa", timestamp: 3 }));

    expect(selectTapeForWallet("0xaaa")(useTapeStore.getState()).map((item) => item.timestamp)).toEqual([
      3,
      1,
    ]);
  });
});
