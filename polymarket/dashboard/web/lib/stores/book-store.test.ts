import { beforeEach, describe, expect, it } from "vitest";

import type { BookDelta } from "../stream/types";
import { useBookStore } from "./book-store";

const delta = (overrides: Partial<BookDelta>): BookDelta => ({
  asset_id: "asset-a",
  bids: [],
  asks: [],
  snapshot: false,
  ...overrides,
});

describe("book-store", () => {
  beforeEach(() => {
    useBookStore.setState({ byAssetId: new Map() });
  });

  it("replaces snapshots and keeps bids descending and asks ascending", () => {
    useBookStore.getState().applyDelta(
      delta({
        snapshot: true,
        bids: [
          ["0.41", "12"],
          ["0.50", "10"],
        ],
        asks: [
          ["0.62", "8"],
          ["0.55", "7"],
        ],
      }),
    );

    useBookStore.getState().applyDelta(
      delta({
        snapshot: true,
        bids: [["0.45", "3"]],
        asks: [["0.60", "4"]],
      }),
    );

    expect(useBookStore.getState().byAssetId.get("asset-a")).toMatchObject({
      bids: [["0.45", "3"]],
      asks: [["0.60", "4"]],
    });
  });

  it("applies incremental deltas and removes zero-sized levels", () => {
    useBookStore.getState().applyDelta(
      delta({
        snapshot: true,
        bids: [
          ["0.50", "10"],
          ["0.40", "2"],
        ],
        asks: [
          ["0.60", "7"],
          ["0.70", "8"],
        ],
      }),
    );

    useBookStore.getState().applyDelta(
      delta({
        bids: [
          ["0.50", "0"],
          ["0.45", "5"],
        ],
        asks: [
          ["0.60", "0"],
          ["0.55", "3"],
        ],
      }),
    );

    expect(useBookStore.getState().byAssetId.get("asset-a")).toMatchObject({
      bids: [
        ["0.45", "5"],
        ["0.40", "2"],
      ],
      asks: [
        ["0.55", "3"],
        ["0.70", "8"],
      ],
    });
  });

  it("treats deltas without prior state as snapshots", () => {
    useBookStore.getState().applyDelta(
      delta({
        bids: [
          ["0.20", "1"],
          ["0.30", "2"],
        ],
        asks: [
          ["0.80", "3"],
          ["0.70", "4"],
        ],
      }),
    );

    expect(useBookStore.getState().byAssetId.get("asset-a")).toMatchObject({
      bids: [
        ["0.30", "2"],
        ["0.20", "1"],
      ],
      asks: [
        ["0.70", "4"],
        ["0.80", "3"],
      ],
    });
  });
});
