import "./_init";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { BookDelta } from "../stream/types";

export interface BookSnapshot {
  bids: [string, string][];
  asks: [string, string][];
  updatedAt: number;
}

export interface BookState {
  byAssetId: Map<string, BookSnapshot>;
  applyDelta(delta: BookDelta): void;
  clear(assetId: string): void;
  clearAll(): void;
}

const sortBids = (levels: [string, string][]): [string, string][] =>
  [...levels].sort((left, right) => Number(right[0]) - Number(left[0]));

const sortAsks = (levels: [string, string][]): [string, string][] =>
  [...levels].sort((left, right) => Number(left[0]) - Number(right[0]));

const applyLevels = (
  current: [string, string][],
  updates: [string, string][],
  sortLevels: (levels: [string, string][]) => [string, string][],
): [string, string][] => {
  const byPrice = new Map(current);

  for (const [price, size] of updates) {
    if (size === "0") {
      byPrice.delete(price);
    } else {
      byPrice.set(price, size);
    }
  }

  return sortLevels(Array.from(byPrice.entries()));
};

export const useBookStore = create<BookState>()(
  immer((set) => ({
    byAssetId: new Map<string, BookSnapshot>(),
    applyDelta: (delta) => {
      set((state) => {
        const existing = state.byAssetId.get(delta.asset_id);
        const updatedAt = Date.now();

        if (delta.snapshot || existing === undefined) {
          state.byAssetId.set(delta.asset_id, {
            bids: sortBids(delta.bids),
            asks: sortAsks(delta.asks),
            updatedAt,
          });
          return;
        }

        state.byAssetId.set(delta.asset_id, {
          bids: applyLevels(existing.bids, delta.bids, sortBids),
          asks: applyLevels(existing.asks, delta.asks, sortAsks),
          updatedAt,
        });
      });
    },
    clear: (assetId) => {
      set((state) => {
        state.byAssetId.delete(assetId);
      });
    },
    clearAll: () => {
      set((state) => {
        state.byAssetId.clear();
      });
    },
  })),
);
