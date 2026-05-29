"use client";

import { useState } from "react";

import { MonoNumber } from "@/components/primitives";
import { WhaleTape } from "@/components/whales/whale-tape";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  useConnectionStore,
  useTape,
  useUiStore,
} from "@/lib/stores";
import { formatTimestampShort } from "@/lib/format";
import type { Side } from "@/lib/stream/types";

function getLastPollLabel(heartbeatPresent: boolean, lastUpdatedAt: number) {
  if (!heartbeatPresent || lastUpdatedAt <= 0) {
    return "—";
  }

  return formatTimestampShort(Math.trunc(lastUpdatedAt / 1_000));
}

export function WhaleTapePanel() {
  const trades = useTape();
  const [localSide, setLocalSide] = useState<Side | null>(null);
  const setSelectedSignalKey = useUiStore(
    (state) => state.setSelectedSignalKey,
  );
  const heartbeat = useConnectionStore((state) => state.heartbeat);
  const botBusLastUpdatedAt = useConnectionStore(
    (state) => state.connections["bot-bus"].lastUpdatedAt,
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-whisper px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            SIGNAL TAPE
          </h2>
          <MonoNumber
            value={trades.length}
            display={trades.length.toString()}
            size="2xs"
            variant="muted"
          />
        </div>
        <ToggleGroup
          type="single"
          value={localSide ?? "all"}
          onValueChange={(value) => {
            setLocalSide(value === "BUY" || value === "SELL" ? value : null);
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
      </div>

      <div className="h-[600px] min-h-0">
        <WhaleTape
          trades={trades}
          filterBySide={localSide}
          onRowClick={(trade) =>
            setSelectedSignalKey(`${trade.condition_id}:${trade.asset_id}`)
          }
        />
      </div>

      <div className="border-t border-whisper px-4 py-3 text-2xs text-muted-steel">
        Showing live · last poll{" "}
        {getLastPollLabel(heartbeat !== null, botBusLastUpdatedAt)}
      </div>
    </section>
  );
}
