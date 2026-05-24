"use client";

import { Radio } from "lucide-react";
import { useQueryState } from "nuqs";

import { ConnectionBadge } from "@/components/primitives";
import { Toggle } from "@/components/ui/toggle";
import {
  type ConnectionName,
  useConnectionStore,
  useLatencyTier,
} from "@/lib/stores";
import { cn } from "@/lib/utils";

export const CONNECTION_NAMES = [
  "clob-ws",
  "data-api",
  "bot-bus",
] as const satisfies readonly ConnectionName[];

export function ConnectionStatusBadge({
  name,
  className,
}: {
  name: ConnectionName;
  className?: string;
}) {
  const tier = useLatencyTier(name);
  const latencyMs = useConnectionStore(
    (state) => state.connections[name].latencyMs,
  );

  return (
    <ConnectionBadge
      name={name}
      latencyMs={latencyMs}
      tier={tier}
      className={className}
    />
  );
}

export function HeaderContent() {
  const [live, setLive] = useQueryState("live", { defaultValue: "1" });
  const isLive = live === "1";

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold uppercase tracking-[0.18em] text-bone">
          POLYMARKET WHALE DECK
        </h1>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <div className="flex flex-wrap items-center gap-2">
          {CONNECTION_NAMES.map((name) => (
            <ConnectionStatusBadge key={name} name={name} />
          ))}
        </div>
        <Toggle
          aria-label="Toggle live refresh"
          pressed={isLive}
          onPressedChange={(pressed) => {
            void setLive(pressed ? "1" : "0");
          }}
          className={cn(
            "h-[26px] rounded-full border border-whisper bg-edge px-2 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-steel hover:bg-plane hover:text-bone",
            "data-[state=on]:bg-edge data-[state=on]:text-teal",
          )}
        >
          <Radio
            aria-hidden="true"
            className={cn("size-3", isLive ? "text-teal" : "text-muted-steel")}
          />
          {isLive ? "LIVE" : "PAUSED"}
        </Toggle>
      </div>
    </div>
  );
}
