import "./_init";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { immer } from "zustand/middleware/immer";

import type { WhaleSignal } from "../stream/types";

// Keyed by `${condition_id}:${asset_id}`.
export type SignalKey = string;

export interface SignalState {
  byKey: Map<SignalKey, WhaleSignal>;
  upsert(signal: WhaleSignal): void;
  expire(key: { condition_id: string; asset_id: string }): void;
  clear(): void;
}

const toSignalKey = (key: { condition_id: string; asset_id: string }): SignalKey =>
  `${key.condition_id}:${key.asset_id}`;

export const useSignalStore = create<SignalState>()(
  immer((set) => ({
    byKey: new Map<SignalKey, WhaleSignal>(),
    upsert: (signal) => {
      set((state) => {
        state.byKey.set(toSignalKey(signal), signal);
      });
    },
    expire: (key) => {
      set((state) => {
        state.byKey.delete(toSignalKey(key));
      });
    },
    clear: () => {
      set((state) => {
        state.byKey.clear();
      });
    },
  })),
);

export const selectAllSignals = (state: SignalState): WhaleSignal[] =>
  Array.from(state.byKey.values()).sort(
    (left, right) => right.latest_timestamp - left.latest_timestamp,
  );

export const selectFreshestSignalKey = (state: SignalState): SignalKey | null => {
  let freshestKey: SignalKey | null = null;
  let freshestTimestamp = -1;

  for (const [key, signal] of state.byKey) {
    if (signal.latest_timestamp > freshestTimestamp) {
      freshestKey = key;
      freshestTimestamp = signal.latest_timestamp;
    }
  }

  return freshestKey;
};

export const selectSignalCount = (state: SignalState): number => state.byKey.size;

export const useSignals = () => useSignalStore(useShallow(selectAllSignals));
export const useFreshestSignalKey = () => useSignalStore(selectFreshestSignalKey);
export const useSignalCount = () => useSignalStore(selectSignalCount);
