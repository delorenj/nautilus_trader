import "./_init";

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { immer } from "zustand/middleware/immer";

export interface WatchedWallet {
  address: string;
  weight: number;
  status: "active" | "paused";
  lifetimePnl: string | null;
  pseudonym: string | null;
}

export interface WalletState {
  byAddress: Map<string, WatchedWallet>;
  add(wallet: Omit<WatchedWallet, "status"> & { status?: WatchedWallet["status"] }): void;
  remove(address: string): void;
  updateWeight(address: string, weight: number): void;
  togglePause(address: string): void;
}

export const useWalletStore = create<WalletState>()(
  immer((set) => ({
    byAddress: new Map<string, WatchedWallet>(),
    add: (wallet) => {
      set((state) => {
        state.byAddress.set(wallet.address, {
          ...wallet,
          status: wallet.status ?? "active",
        });
      });
    },
    remove: (address) => {
      set((state) => {
        state.byAddress.delete(address);
      });
    },
    updateWeight: (address, weight) => {
      set((state) => {
        const wallet = state.byAddress.get(address);

        if (wallet !== undefined) {
          wallet.weight = weight;
        }
      });
    },
    togglePause: (address) => {
      set((state) => {
        const wallet = state.byAddress.get(address);

        if (wallet !== undefined) {
          wallet.status = wallet.status === "active" ? "paused" : "active";
        }
      });
    },
  })),
);

export const selectWatchedWallets = (state: WalletState): WatchedWallet[] =>
  Array.from(state.byAddress.values()).sort((left, right) =>
    left.address.localeCompare(right.address),
  );

export const selectWalletByAddress =
  (address: string) =>
  (state: WalletState): WatchedWallet | null =>
    state.byAddress.get(address) ?? null;

export const useWatchedWallets = () => useWalletStore(useShallow(selectWatchedWallets));
export const useWalletByAddress = (address: string) =>
  useWalletStore(selectWalletByAddress(address));
