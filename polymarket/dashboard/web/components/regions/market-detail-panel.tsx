"use client";

import { Lock } from "lucide-react";

import { MonoNumber, WalletAddress } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useSelectedSignalKey,
  useSignalStore,
} from "@/lib/stores";
import type { WhaleSignal } from "@/lib/stream/types";

export interface MarketDetailPanelProps {
  selectedSignal?: WhaleSignal | null;
}

function signalTitle(signal: WhaleSignal) {
  return signal.title ?? signal.slug ?? signal.event_slug ?? signal.instrument_id;
}

export function MarketDetailPanel({
  selectedSignal,
}: MarketDetailPanelProps) {
  const selectedSignalKey = useSelectedSignalKey();
  const storedSignal = useSignalStore((state) =>
    selectedSignalKey ? state.byKey.get(selectedSignalKey) ?? null : null,
  );
  const signal = selectedSignal ?? storedSignal;

  if (signal === null) {
    return (
      <section className="flex min-h-[260px] items-center justify-center rounded-[8px] border border-whisper bg-plane px-6 py-8">
        <p className="text-center text-base text-muted-steel">
          Select a signal to inspect a market.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[8px] border border-whisper bg-plane p-4">
      <div className="rounded-[8px] border border-whisper bg-edge px-5 py-4">
        <div className="border-b border-whisper pb-4">
          <h2 className="line-clamp-2 text-lg font-semibold text-bone">
            {signalTitle(signal)}
          </h2>
          <p className="mt-1 text-md text-steel">
            {signal.outcome ?? "Outcome unavailable"}
          </p>
          <div className="mt-3 grid gap-2 text-2xs text-muted-steel md:grid-cols-2">
            <div className="min-w-0">
              <span className="mb-1 block uppercase tracking-[0.14em]">
                Condition
              </span>
              <WalletAddress
                address={signal.condition_id}
                leading={10}
                trailing={8}
                size="2xs"
              />
            </div>
            <div className="min-w-0">
              <span className="mb-1 block uppercase tracking-[0.14em]">
                Asset
              </span>
              <WalletAddress
                address={signal.asset_id}
                leading={10}
                trailing={8}
                size="2xs"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 py-4 md:grid-cols-2">
          <div className="rounded-[8px] border border-dashed border-whisper bg-plane/60 p-4">
            <div className="flex h-[80px] w-full max-w-[200px] items-center text-sm text-muted-steel">
              Probability sparkline coming soon
            </div>
          </div>
          <div className="rounded-[8px] border border-dashed border-whisper bg-plane/60 p-4">
            <div className="flex h-[80px] w-full max-w-[200px] items-center text-sm text-muted-steel">
              Order book depth coming soon
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-whisper bg-plane p-4">
          <div className="mb-3 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            EXECUTE
          </div>
          <div className="grid gap-2 text-2xs">
            <div className="min-w-0 truncate" data-mono>
              {signal.instrument_id}
            </div>
            <div className="flex flex-wrap items-center gap-2" data-mono>
              <span className="text-muted-steel">{signal.side}</span>
              <span className="text-ghost">/</span>
              <MonoNumber
                value={signal.suggested_notional}
                size="2xs"
                variant="accent"
                compact
                unit="pUSD"
              />
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="mt-4 inline-flex">
                <Button disabled size="sm" className="gap-2">
                  <Lock size={14} aria-hidden="true" />
                  Execute · DRY-RUN
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              Live execution disabled. Set LIVE_TRADING_ENABLED=true to enable.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </section>
  );
}
