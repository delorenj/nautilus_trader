import { beforeEach, describe, expect, it } from "vitest";

import type { WhaleSignal } from "../stream/types";
import {
  selectAllSignals,
  selectFreshestSignalKey,
  selectSignalCount,
  useSignalStore,
} from "./signal-store";

const signal = (overrides: Partial<WhaleSignal>): WhaleSignal => ({
  condition_id: "condition-a",
  asset_id: "asset-a",
  instrument_id: "instrument-a",
  side: "BUY",
  score_notional: "100",
  suggested_notional: "10",
  reference_price: "0.50",
  trade_count: 1,
  latest_timestamp: 1,
  wallets: ["0xaaa"],
  title: null,
  slug: null,
  event_slug: null,
  outcome: null,
  ...overrides,
});

describe("signal-store", () => {
  beforeEach(() => {
    useSignalStore.setState({ byKey: new Map() });
  });

  it("upserts idempotently by condition and asset", () => {
    useSignalStore.getState().upsert(signal({ latest_timestamp: 100 }));
    useSignalStore.getState().upsert(signal({ latest_timestamp: 200, side: "SELL" }));

    expect(selectSignalCount(useSignalStore.getState())).toBe(1);
    expect(selectAllSignals(useSignalStore.getState())[0]).toMatchObject({
      latest_timestamp: 200,
      side: "SELL",
    });
  });

  it("expires only the targeted key", () => {
    useSignalStore.getState().upsert(signal({ condition_id: "condition-a", asset_id: "asset-a" }));
    useSignalStore.getState().upsert(signal({ condition_id: "condition-b", asset_id: "asset-b" }));

    useSignalStore.getState().expire({ condition_id: "condition-a", asset_id: "asset-a" });

    expect(selectSignalCount(useSignalStore.getState())).toBe(1);
    expect(useSignalStore.getState().byKey.has("condition-b:asset-b")).toBe(true);
  });

  it("selects signals by latest timestamp descending", () => {
    useSignalStore.getState().upsert(signal({ condition_id: "condition-a", latest_timestamp: 100 }));
    useSignalStore.getState().upsert(signal({ condition_id: "condition-b", latest_timestamp: 300 }));
    useSignalStore.getState().upsert(signal({ condition_id: "condition-c", latest_timestamp: 200 }));

    expect(selectAllSignals(useSignalStore.getState()).map((item) => item.condition_id)).toEqual([
      "condition-b",
      "condition-c",
      "condition-a",
    ]);
    expect(selectFreshestSignalKey(useSignalStore.getState())).toBe("condition-b:asset-a");
  });
});
