"use client";

import {
  FileCheck2,
  ReceiptText,
  SendHorizontal,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { MonoNumber } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import type {
  ExecutionIntentCheck,
  ExecutionIntentSnapshot,
  KrakenSpotOrderIntent,
} from "@/lib/autonomy/execution-intent";
import type {
  ExecutionFillArtifact,
  ExecutionSubmitState,
} from "@/lib/autonomy/execution-submit";
import { cn } from "@/lib/utils";

function statusTone(status: ExecutionIntentCheck["status"]) {
  switch (status) {
    case "pass":
      return "border-teal/50 text-teal";
    case "warn":
      return "border-sand/50 text-sand";
    default:
      return "border-rust/60 text-rust";
  }
}

function intentStatusTone(status: ExecutionIntentSnapshot["status"]) {
  switch (status) {
    case "live-ready-dry-run":
      return "border-teal/50 text-teal";
    case "paper-ready":
      return "border-amber/50 text-amber";
    default:
      return "border-rust/60 text-rust";
  }
}

function statusCopy(status: ExecutionIntentSnapshot["status"]) {
  switch (status) {
    case "live-ready-dry-run":
      return "dry-run ready";
    case "paper-ready":
      return "paper ticket";
    default:
      return "blocked";
  }
}

function roleLabel(role: KrakenSpotOrderIntent["role"]) {
  switch (role) {
    case "entry":
      return "entry";
    case "take_profit":
      return "take profit";
    case "stop_loss":
      return "stop loss";
    case "timebox_exit":
      return "timebox";
  }
}

function priceLabel(intent: KrakenSpotOrderIntent) {
  if (intent.limitPrice !== null) {
    return intent.limitPrice.toFixed(2);
  }
  if (intent.triggerPrice !== null) {
    return intent.triggerPrice.toFixed(2);
  }
  return "market";
}

function OrderIntentCard({ intent }: { intent: KrakenSpotOrderIntent }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-3">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
          {roleLabel(intent.role)}
        </span>
        <span
          data-mono
          className={cn(
            "rounded-full border px-2 py-0.5 text-2xs uppercase",
            intent.side === "BUY"
              ? "border-teal/50 text-teal"
              : "border-rust/60 text-rust",
          )}
        >
          {intent.side}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-2xs">
        <div className="min-w-0">
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            order
          </div>
          <div data-mono className="mt-1 text-bone">
            {intent.orderType} / {intent.timeInForce}
          </div>
        </div>
        <div className="min-w-0">
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            price
          </div>
          <div data-mono className="mt-1 text-bone">
            {priceLabel(intent)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            notional
          </div>
          <MonoNumber
            value={intent.quoteNotionalUsd}
            size="2xs"
            unit="USD"
            precision={2}
            variant="accent"
          />
        </div>
        <div className="min-w-0">
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            quantity
          </div>
          <div data-mono className="mt-1 text-bone">
            {intent.baseQuantity === null
              ? "-"
              : intent.baseQuantity.toFixed(8)}
          </div>
        </div>
      </div>
      <div className="mt-3 min-w-0 text-2xs text-muted-steel">
        <span data-mono>{intent.clientOrderId}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-steel">{intent.reason}</p>
    </div>
  );
}

function CheckRow({ check }: { check: ExecutionIntentCheck }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-bone">
          {check.label}
        </span>
        <span
          data-mono
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-2xs uppercase",
            statusTone(check.status),
          )}
        >
          {check.status}
        </span>
      </div>
      <p className="mt-1 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
        {check.detail}
      </p>
    </div>
  );
}

function FillRow({ fill }: { fill: ExecutionFillArtifact }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-whisper bg-plane px-3 py-2">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-steel">
          {roleLabel(fill.role)}
        </span>
        <span data-mono className="text-2xs text-bone">
          {fill.source}
        </span>
      </div>
      <div className="grid gap-2 text-2xs md:grid-cols-4">
        <div className="min-w-0">
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            client
          </div>
          <div data-mono className="mt-1 truncate text-bone">
            {fill.clientOrderId}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            qty
          </div>
          <div data-mono className="mt-1 text-bone">
            {fill.filledQuantity === null
              ? "-"
              : fill.filledQuantity.toFixed(8)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            avg
          </div>
          <div data-mono className="mt-1 text-bone">
            {fill.averageFillPrice === null
              ? "-"
              : fill.averageFillPrice.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-muted-steel">
            pnl
          </div>
          <MonoNumber
            value={fill.realizedPnlUsd}
            size="2xs"
            unit="USD"
            precision={2}
            variant={(fill.realizedPnlUsd ?? 0) >= 0 ? "positive" : "negative"}
          />
        </div>
      </div>
    </div>
  );
}

export function ExecutionIntentPanel() {
  const [intent, setIntent] = useState<ExecutionIntentSnapshot | null>(null);
  const [submitState, setSubmitState] = useState<ExecutionSubmitState | null>(
    null,
  );
  const [submitPending, setSubmitPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function load() {
      try {
        const response = await fetch("/api/autonomy/execution-intent", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`execution intent HTTP ${response.status}`);
        }
        const snapshot = (await response.json()) as ExecutionIntentSnapshot;
        if (!canceled) {
          setIntent(snapshot);
          setError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load execution intent.",
          );
        }
      }

      try {
        const response = await fetch("/api/autonomy/execution-submit", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`execution submit HTTP ${response.status}`);
        }
        const snapshot = (await response.json()) as ExecutionSubmitState;
        if (!canceled) {
          setSubmitState(snapshot);
          setSubmitError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setSubmitError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load execution attempts.",
          );
        }
      }
    }

    void load();
    const interval = globalThis.setInterval(() => {
      void load();
    }, 3_000);

    return () => {
      canceled = true;
      globalThis.clearInterval(interval);
    };
  }, []);

  async function recordDryRun() {
    setSubmitPending(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/autonomy/execution-submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ mode: "dry-run" }),
      });
      if (!response.ok) {
        throw new Error(`dry-run submit HTTP ${response.status}`);
      }
      const snapshot = (await response.json()) as ExecutionSubmitState;
      setSubmitState(snapshot);
    } catch (submitLoadError) {
      setSubmitError(
        submitLoadError instanceof Error
          ? submitLoadError.message
          : "Unable to record dry-run attempt.",
      );
    } finally {
      setSubmitPending(false);
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-whisper bg-plane p-4">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SendHorizontal className="size-3.5 text-amber" aria-hidden="true" />
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-steel">
            EXECUTION INTENT
          </h2>
        </div>
        <span
          data-mono
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-2xs uppercase",
            intentStatusTone(intent?.status ?? "blocked"),
          )}
        >
          {statusCopy(intent?.status ?? "blocked")}
        </span>
      </div>

      <div className="rounded-[8px] border border-whisper bg-edge px-3 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 text-amber" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-bone">
              {intent?.statusLabel ?? "Loading the latest execution ticket."}
            </p>
            <p className="mt-1 break-words text-2xs text-muted-steel [overflow-wrap:anywhere]">
              This panel emits the order ticket, exit plan, and reconciliation
              fields. It never submits a live Kraken order.
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-2xs text-rust">{error}</p>}

        {intent && (
          <div className="mt-3 grid gap-3">
            {intent.entry ? (
              <OrderIntentCard intent={intent.entry} />
            ) : (
              <div className="rounded-[8px] border border-dashed border-whisper bg-plane/70 px-4 py-5 text-sm text-muted-steel">
                No entry ticket exists for the latest cycle.
              </div>
            )}

            {intent.exits.length > 0 && (
              <div className="grid gap-2 xl:grid-cols-3">
                {intent.exits.map((exit) => (
                  <OrderIntentCard key={exit.intentId} intent={exit} />
                ))}
              </div>
            )}

            <div className="grid gap-2 xl:grid-cols-2">
              {intent.checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>

            <div className="rounded-[8px] border border-whisper bg-plane px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                <ReceiptText className="size-3.5" aria-hidden="true" />
                Reconciliation
              </div>
              <div className="grid gap-2 text-2xs md:grid-cols-3">
                <div>
                  <div className="uppercase tracking-[0.14em] text-muted-steel">
                    status
                  </div>
                  <div data-mono className="mt-1 text-bone">
                    {intent.reconciliation.status}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.14em] text-muted-steel">
                    latest cycle
                  </div>
                  <div data-mono className="mt-1 text-bone">
                    {intent.reconciliation.latestPaper?.cycleId ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.14em] text-muted-steel">
                    paper pnl
                  </div>
                  <MonoNumber
                    value={intent.reconciliation.latestPaper?.pnlUsd ?? null}
                    size="2xs"
                    unit="USD"
                    precision={2}
                    variant={
                      (intent.reconciliation.latestPaper?.pnlUsd ?? 0) >= 0
                        ? "positive"
                        : "negative"
                    }
                  />
                </div>
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                {intent.reconciliation.expectedLiveFields.slice(0, 6).map((field) => (
                  <span
                    key={field}
                    data-mono
                    className="rounded-full border border-whisper bg-edge px-2 py-0.5 text-2xs text-muted-steel"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-whisper bg-plane px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                <FileCheck2 className="size-3.5" aria-hidden="true" />
                Submission
              </div>
              <p className="text-xs text-steel">{intent.submission.reason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="border border-amber/40 bg-amber text-canvas hover:bg-amber/90"
                  disabled={intent.entry === null || submitPending}
                  onClick={() => {
                    void recordDryRun();
                  }}
                >
                  <FileCheck2 className="size-3.5" aria-hidden="true" />
                  {submitPending ? "Recording" : "Record dry-run"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="border border-whisper bg-edge text-muted-steel"
                  disabled
                >
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                  Submit live
                </Button>
              </div>
              {submitError && (
                <p className="mt-3 text-2xs text-rust">{submitError}</p>
              )}
              {submitState?.attempt && (
                <div className="mt-3 rounded-[8px] border border-whisper bg-edge px-3 py-3">
                  <div className="grid gap-2 text-2xs md:grid-cols-4">
                    <div className="min-w-0">
                      <div className="uppercase tracking-[0.14em] text-muted-steel">
                        attempt
                      </div>
                      <div data-mono className="mt-1 truncate text-bone">
                        {submitState.attempt.attemptId}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.14em] text-muted-steel">
                        mode
                      </div>
                      <div data-mono className="mt-1 text-bone">
                        {submitState.attempt.mode}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.14em] text-muted-steel">
                        status
                      </div>
                      <div data-mono className="mt-1 text-bone">
                        {submitState.attempt.status}
                      </div>
                    </div>
                    <div>
                      <div className="uppercase tracking-[0.14em] text-muted-steel">
                        recon
                      </div>
                      <div data-mono className="mt-1 text-bone">
                        {submitState.reconciliation?.status ?? "-"}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-steel">
                    {submitState.attempt.statusLabel}
                  </p>
                  {submitState.reconciliation?.fills?.length ? (
                    <div className="mt-3 grid gap-2">
                      {submitState.reconciliation.fills.map((fill) => (
                        <FillRow
                          key={`${fill.role}-${fill.clientOrderId}`}
                          fill={fill}
                        />
                      ))}
                    </div>
                  ) : null}
                  {submitState.attempt.liveCommand && (
                    <div className="mt-3 rounded-[8px] border border-teal/30 bg-plane px-3 py-3">
                      <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-steel">
                        <SendHorizontal
                          className="size-3.5 text-teal"
                          aria-hidden="true"
                        />
                        Nautilus bridge
                      </div>
                      <div className="grid gap-2 text-2xs md:grid-cols-4">
                        <div className="min-w-0">
                          <div className="uppercase tracking-[0.14em] text-muted-steel">
                            adapter
                          </div>
                          <div data-mono className="mt-1 truncate text-bone">
                            {submitState.attempt.liveCommand.clientConfig.adapter}
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-[0.14em] text-muted-steel">
                            product
                          </div>
                          <div data-mono className="mt-1 text-bone">
                            {
                              submitState.attempt.liveCommand.clientConfig
                                .productTypes[0]
                            }{" "}
                            CASH
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-[0.14em] text-muted-steel">
                            boundary
                          </div>
                          <div data-mono className="mt-1 text-bone">
                            {submitState.attempt.liveCommand.safetyBoundary}
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-[0.14em] text-muted-steel">
                            command
                          </div>
                          <div data-mono className="mt-1 text-bone">
                            {submitState.attempt.liveCommand.entry.orderType} /{" "}
                            {submitState.attempt.liveCommand.entry.timeInForce}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {intent.submission.blockedBy.length > 0 && (
                <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                  {intent.submission.blockedBy.slice(0, 8).map((blocker) => (
                    <span
                      key={blocker}
                      className="rounded-full border border-rust/50 bg-rust/10 px-2 py-0.5 text-2xs text-rust"
                    >
                      {blocker}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
