import { beforeEach, describe, expect, it } from "vitest";

import {
  type WatchedWallet,
  selectWalletByAddress,
  selectWatchedWallets,
  useWalletStore,
} from "./wallet-store";

const wallet = (
  overrides: Partial<Omit<WatchedWallet, "status"> & { status?: WatchedWallet["status"] }>,
): Omit<WatchedWallet, "status"> & { status?: WatchedWallet["status"] } => ({
  address: "0xbbb",
  weight: 1,
  lifetimePnl: null,
  pseudonym: null,
  ...overrides,
});

describe("wallet-store", () => {
  beforeEach(() => {
    useWalletStore.setState({ byAddress: new Map() });
  });

  it("adds wallets with a default active status and sorts by address", () => {
    useWalletStore.getState().add(wallet({ address: "0xbbb" }));
    useWalletStore.getState().add(wallet({ address: "0xaaa", status: "paused" }));

    expect(selectWatchedWallets(useWalletStore.getState()).map((item) => item.address)).toEqual([
      "0xaaa",
      "0xbbb",
    ]);
    expect(selectWalletByAddress("0xbbb")(useWalletStore.getState())).toMatchObject({
      status: "active",
    });
  });

  it("removes, updates weight, and toggles paused status", () => {
    useWalletStore.getState().add(wallet({ address: "0xaaa" }));
    useWalletStore.getState().updateWeight("0xaaa", 1.5);
    useWalletStore.getState().togglePause("0xaaa");

    expect(selectWalletByAddress("0xaaa")(useWalletStore.getState())).toMatchObject({
      weight: 1.5,
      status: "paused",
    });

    useWalletStore.getState().remove("0xaaa");

    expect(selectWalletByAddress("0xaaa")(useWalletStore.getState())).toBeNull();
  });

  it("overwrites when re-adding an existing address", () => {
    useWalletStore.getState().add(wallet({ address: "0xaaa", weight: 1, pseudonym: "First" }));
    useWalletStore.getState().add(
      wallet({ address: "0xaaa", weight: 2, status: "paused", pseudonym: "Second" }),
    );

    expect(selectWalletByAddress("0xaaa")(useWalletStore.getState())).toEqual({
      address: "0xaaa",
      weight: 2,
      status: "paused",
      lifetimePnl: null,
      pseudonym: "Second",
    });
  });
});
