"use client";

import { Suspense } from "react";

import { ArtifactSnapshotBootstrap } from "@/components/bootstrap/artifact-snapshot-bootstrap";
import { MockStreamBootstrap } from "@/components/bootstrap/mock-stream-bootstrap";
import { CommandDeck } from "@/components/layout/command-deck";
import { AutonomyCyclePanel } from "@/components/regions/autonomy-cycle-panel";
import { ConnectionsPanel } from "@/components/regions/connections-panel";
import { ExecutionGatePanel } from "@/components/regions/execution-gate-panel";
import { ExecutionIntentPanel } from "@/components/regions/execution-intent-panel";
import { HeaderContent } from "@/components/regions/header-content";
import { MarketDetailPanel } from "@/components/regions/market-detail-panel";
import { SignalStreamPanel } from "@/components/regions/signal-stream-panel";
import { WatchedWalletsPanel } from "@/components/regions/watched-wallets-panel";
import { WhaleTapePanel } from "@/components/regions/whale-tape-panel";

export default function CommandDeckPage() {
  return (
    <Suspense
      fallback={<div className="min-h-[100dvh] bg-canvas text-bone" />}
    >
      <MockStreamBootstrap />
      <ArtifactSnapshotBootstrap />
      <CommandDeck>
        <CommandDeck.Header>
          <HeaderContent />
        </CommandDeck.Header>
        <CommandDeck.RailLeft>
          <WatchedWalletsPanel />
          <ConnectionsPanel />
        </CommandDeck.RailLeft>
        <CommandDeck.Main>
          <AutonomyCyclePanel />
          <ExecutionGatePanel />
          <ExecutionIntentPanel />
          <SignalStreamPanel />
          <MarketDetailPanel />
        </CommandDeck.Main>
        <CommandDeck.RailRight>
          <WhaleTapePanel />
        </CommandDeck.RailRight>
      </CommandDeck>
    </Suspense>
  );
}
