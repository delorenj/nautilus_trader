"use client";

import { ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  ExecutionGateCheck,
  ExecutionGateStatus,
  ExecutionReadinessSnapshot,
  LiveAcceptanceGroup,
  LiveAcceptanceStatus,
} from "@/lib/autonomy/live-readiness";
import { cn } from "@/lib/utils";

function statusTone(status: ExecutionGateStatus | LiveAcceptanceStatus) {
  switch (status) {
    case "pass":
      return "border-teal/50 text-teal";
    case "warn":
      return "border-sand/50 text-sand";
    case "manual":
      return "border-amber/50 text-amber";
    default:
      return "border-rust/60 text-rust";
  }
}

function statusLabel(status: ExecutionGateStatus | LiveAcceptanceStatus) {
  switch (status) {
    case "pass":
      return "pass";
    case "warn":
      return "watch";
    case "manual":
      return "prove";
    default:
      return "block";
  }
}

function GateCheckRow({ check }: { check: ExecutionGateCheck }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-bone">
          {check.label}
        </span>
        <span
          data-mono
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-2xs uppercase",
            statusTone(check.status),
          )}
        >
          {statusLabel(check.status)}
        </span>
      </div>
      <p className="mt-1 min-w-0 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
        {check.detail}
      </p>
    </div>
  );
}

function AcceptanceGroupCard({ group }: { group: LiveAcceptanceGroup }) {
  const passed = group.items.filter((item) => item.status === "pass").length;

  return (
    <div className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-3">
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
            {group.label}
          </div>
          <p className="mt-1 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
            {group.summary}
          </p>
        </div>
        <span data-mono className="shrink-0 text-2xs text-bone">
          {passed}/{group.items.length}
        </span>
      </div>
      <div className="grid gap-2">
        {group.items.map((item) => (
          <div
            key={item.id}
            className="min-w-0 rounded-[8px] border border-whisper bg-edge px-3 py-2"
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 text-xs font-medium text-bone">
                {item.label}
              </span>
              <span
                data-mono
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-2xs uppercase",
                  statusTone(item.status),
                )}
              >
                {statusLabel(item.status)}
              </span>
            </div>
            <p className="mt-1 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
              {item.detail}
            </p>
            {item.evidence && (
              <p className="mt-1 break-words text-2xs text-steel [overflow-wrap:anywhere]">
                {item.evidence}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionGatePanel() {
  const [readiness, setReadiness] = useState<ExecutionReadinessSnapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        const response = await fetch("/api/autonomy/readiness", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`readiness HTTP ${response.status}`);
        }
        const snapshot = (await response.json()) as ExecutionReadinessSnapshot;
        if (!canceled) {
          setReadiness(snapshot);
          setError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load execution gate.",
          );
        }
      }
    }

    void load();
    const interval = globalThis.setInterval(() => {
      void load();
    }, 5_000);

    return () => {
      canceled = true;
      globalThis.clearInterval(interval);
    };
  }, []);

  const blocked = readiness?.liveBlocked ?? true;
  const Icon = blocked ? ShieldX : ShieldCheck;
  const checks = readiness?.checks ?? [];

  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-whisper bg-plane p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
          EXECUTION GATE
        </h2>
        <span
          data-mono
          className={cn(
            "rounded-full border px-2 py-0.5 text-2xs uppercase",
            blocked ? "border-rust/60 text-rust" : "border-teal/50 text-teal",
          )}
        >
          {blocked ? "paper only" : "live ready"}
        </span>
      </div>

      <div className="rounded-[8px] border border-whisper bg-edge px-3 py-3">
        <div className="flex items-start gap-2">
          <Icon
            className={cn("mt-0.5 size-4", blocked ? "text-rust" : "text-teal")}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-bone">
              {readiness?.statusLabel ?? "Checking live Kraken Spot gate."}
            </p>
            <p className="mt-1 min-w-0 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
              The runner still defaults to paper. Live orders require every gate
              below and a separate executor path.
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-2xs text-rust">{error}</p>}

        {readiness && (
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[8px] border border-whisper bg-plane px-3 py-2">
                <div className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
                  cycles
                </div>
                <div data-mono className="mt-1 text-sm text-bone">
                  {readiness.evidence.cycleCount}
                </div>
              </div>
              <div className="rounded-[8px] border border-whisper bg-plane px-3 py-2">
                <div className="text-2xs uppercase tracking-[0.16em] text-muted-steel">
                  max order
                </div>
                <div data-mono className="mt-1 text-sm text-bone">
                  {readiness.risk.maxNotionalUsd === null
                    ? "-"
                    : `${readiness.risk.maxNotionalUsd.toFixed(0)} USD`}
                </div>
              </div>
            </div>
            {checks.map((check) => (
              <GateCheckRow key={check.id} check={check} />
            ))}
            <div className="mt-2 rounded-[8px] border border-whisper bg-plane px-3 py-3">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                  GO-LIVE ROADMAP
                </div>
                <span data-mono className="shrink-0 text-2xs text-bone">
                  {readiness.acceptance.summary.passedRequiredItems}/
                  {readiness.acceptance.summary.requiredItems}
                </span>
              </div>
              <p className="break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
                {readiness.acceptance.summary.statusLabel}
              </p>
            </div>
            <div className="grid gap-2">
              {readiness.acceptance.groups.map((group) => (
                <AcceptanceGroupCard key={group.id} group={group} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
