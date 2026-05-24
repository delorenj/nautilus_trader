import "./_init";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { immer } from "zustand/middleware/immer";

import type { WhaleTrade } from "../stream/types";

const DEFAULT_TAPE_CAP = 2_000;

export interface TapeState {
  trades: WhaleTrade[];
  cap: number;
  append(trade: WhaleTrade): void;
  clear(): void;
}

export const useTapeStore = create<TapeState>()(
  immer((set) => ({
    trades: [],
    cap: DEFAULT_TAPE_CAP,
    append: (trade) => {
      set((state) => {
        state.trades.unshift(trade);

        if (state.trades.length > state.cap) {
          state.trades.splice(state.cap);
        }
      });
    },
    clear: () => {
      set((state) => {
        state.trades = [];
      });
    },
  })),
);

export const selectTape =
  (limit?: number) =>
  (state: TapeState): WhaleTrade[] =>
    limit === undefined ? state.trades : state.trades.slice(0, limit);

export const selectTapeForWallet =
  (wallet: string) =>
  (state: TapeState): WhaleTrade[] =>
    state.trades.filter((trade) => trade.wallet === wallet);

export const useTape = (limit?: number) => useTapeStore(useShallow(selectTape(limit)));
export const useTapeForWallet = (wallet: string) =>
  useTapeStore(useShallow(selectTapeForWallet(wallet)));
