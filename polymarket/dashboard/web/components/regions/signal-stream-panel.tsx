"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";

import { SignalCard } from "@/components/signals/signal-card";
import { MonoNumber } from "@/components/primitives";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toggle } from "@/components/ui/toggle";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  useConnectionStore,
  useSignalCount,
  useSignals,
  useUiStore,
} from "@/lib/stores";
import { formatTimestampShort } from "@/lib/format";
import type { WhaleSignal } from "@/lib/stream/types";
import { cn } from "@/lib/utils";

type SignalSideFilter = "all" | "BUY" | "SELL";

function signalKey(signal: Pick<WhaleSignal, "condition_id" | "asset_id">) {
  return `${signal.condition_id}:${signal.asset_id}`;
}

function normalizeSideFilter(value: string): SignalSideFilter {
  if (value === "BUY" || value === "SELL") {
    return value;
  }

  return "all";
}

function getLastPollLabel(heartbeatPresent: boolean, lastUpdatedAt: number) {
  if (!heartbeatPresent || lastUpdatedAt <= 0) {
    return "—";
  }

  return formatTimestampShort(Math.trunc(lastUpdatedAt / 1_000));
}

function matchesSearch(signal: WhaleSignal, query: string) {
  if (query.trim() === "") {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const searchableText = [
    signal.title,
    signal.outcome,
    signal.slug,
    signal.event_slug,
    signal.condition_id,
    signal.asset_id,
    signal.instrument_id,
    signal.side,
    ...signal.wallets,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

export function SignalStreamPanel() {
  const signals = useSignals();
  const signalCount = useSignalCount();
  const selectedSignalKey = useUiStore((state) => state.selectedSignalKey);
  const setSelectedSignalKey = useUiStore(
    (state) => state.setSelectedSignalKey,
  );
  const heartbeat = useConnectionStore((state) => state.heartbeat);
  const botBusLastUpdatedAt = useConnectionStore(
    (state) => state.connections["bot-bus"].lastUpdatedAt,
  );
  const [side, setSide] = useQueryState("side", { defaultValue: "all" });
  const [min, setMin] = useQueryState("min", { defaultValue: "0" });
  const [query, setQuery] = useQueryState("q", { defaultValue: "" });
  const normalizedSide = normalizeSideFilter(side);
  const minThresholdEnabled = min === "5000";

  const filteredSignals = useMemo(
    () =>
      signals.filter((signal) => {
        const sideMatches =
          normalizedSide === "all" || signal.side === normalizedSide;
        const thresholdMatches =
          !minThresholdEnabled || Number(signal.score_notional) > 5_000;

        return (
          sideMatches &&
          thresholdMatches &&
          matchesSearch(signal, query)
        );
      }),
    [minThresholdEnabled, normalizedSide, query, signals],
  );

  const lastPollLabel = getLastPollLabel(
    heartbeat !== null,
    botBusLastUpdatedAt,
  );

  return (
    <section className="min-w-0 rounded-[8px] border border-whisper bg-plane">
      <div className="flex min-w-0 flex-col gap-3 border-b border-whisper px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            SIGNAL STREAM
          </h2>
          <MonoNumber
            value={signalCount}
            display={signalCount.toString()}
            size="2xs"
            variant="muted"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <ToggleGroup
            type="single"
            value={normalizedSide}
            onValueChange={(value) => {
              void setSide(value || "all");
            }}
            variant="outline"
            size="sm"
          >
            {(["all", "BUY", "SELL"] as const).map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="border-whisper bg-edge text-2xs uppercase tracking-[0.12em] text-muted-steel data-[state=on]:text-bone"
              >
                {value === "all" ? "ALL" : value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Toggle
            pressed={minThresholdEnabled}
            onPressedChange={(pressed) => {
              void setMin(pressed ? "5000" : "0");
            }}
            className="h-8 rounded-md border border-whisper bg-edge px-3 text-2xs font-medium uppercase tracking-[0.12em] text-muted-steel data-[state=on]:text-amber"
          >
            &gt; $5K
          </Toggle>
          <Input
            value={query}
            onChange={(event) => {
              void setQuery(event.target.value);
            }}
            placeholder="Search"
            className="h-8 w-full border-whisper bg-edge text-sm text-bone placeholder:text-muted-steel sm:w-[180px] lg:w-[220px]"
          />
        </div>
      </div>

      <ScrollArea className="h-[min(640px,calc(100dvh-260px))] min-h-[420px]">
        <div className="space-y-3 p-4">
          {filteredSignals.length > 0 ? (
            filteredSignals.map((signal, index) => {
              const key = signalKey(signal);
              const isStale = Date.now() / 1_000 - signal.latest_timestamp > 120;

              return (
                <SignalCard
                  key={key}
                  signal={signal}
                  isFreshest={index === 0}
                  isStale={isStale}
                  onClick={() => setSelectedSignalKey(key)}
                  className={cn(
                    selectedSignalKey === key &&
                      "border-amber/60 shadow-[inset_0_0_0_1px_rgba(217,119,87,0.45)]",
                  )}
                />
              );
            })
          ) : (
            <div className="rounded-[8px] border border-dashed border-whisper bg-edge/40 px-5 py-8 text-center">
              <p className="text-base text-muted-steel">
                Waiting for whale flow. Last poll {lastPollLabel}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
