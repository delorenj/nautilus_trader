"use client";

import { useEffect } from "react";

import { createMockStream } from "@/lib/mock/generator";
import { mulberry32, randomAddress } from "@/lib/mock/random";
import {
  useBookStore,
  useConnectionStore,
  useSignalStore,
  useTapeStore,
  useWalletStore,
} from "@/lib/stores";
import type { StreamEvent } from "@/lib/stream/types";

const MOCK_SEED = 1337;
const WATCHED_WALLET_PSEUDONYMS = [
  "BTC Momentum",
  "ETH Relative Strength",
  "Spread Guard",
  "Volatility Gate",
  "Liquidity Sweep",
] as const;

function seedWatchedWallets() {
  const walletStore = useWalletStore.getState();

  if (walletStore.byAddress.size > 0) {
    return;
  }

  const rng = mulberry32(MOCK_SEED);

  for (const pseudonym of WATCHED_WALLET_PSEUDONYMS) {
    walletStore.add({
      address: randomAddress(rng),
      weight: 1.0,
      status: "active",
      lifetimePnl: null,
      pseudonym,
    });
  }
}

function handleStreamEvent(event: StreamEvent) {
  switch (event.type) {
    case "trade.whale":
      useTapeStore.getState().append(event.data);
      break;
    case "signal.upsert":
      useSignalStore.getState().upsert(event.data);
      break;
    case "signal.expire":
      useSignalStore.getState().expire(event.data);
      break;
    case "book.delta":
      useBookStore.getState().applyDelta(event.data);
      break;
    case "position.update":
      break;
    case "heartbeat":
      useConnectionStore.getState().setHeartbeat(event.data);
      useConnectionStore
        .getState()
        .setStatus("clob-ws", "connected", event.data.clob_ms);
      useConnectionStore
        .getState()
        .setStatus("data-api", "connected", event.data.data_api_ms);
      useConnectionStore.getState().setStatus("bot-bus", "connected", null);
      break;
  }
}

export function MockStreamBootstrap() {
  useEffect(() => {
    seedWatchedWallets();

    const stream = createMockStream({
      onEvent: handleStreamEvent,
      walletCount: 5,
      signalIntervalMs: 1_500,
      tradeIntervalMs: 400,
      seed: MOCK_SEED,
    });

    stream.start();

    return () => {
      stream.stop();
    };
  }, []);

  return null;
}
