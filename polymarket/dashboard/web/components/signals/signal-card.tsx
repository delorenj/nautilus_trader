"use client";

import * as React from "react";
import Decimal from "decimal.js";

import { BuySellPill } from "../primitives/buy-sell-pill";
import { FreshnessPulse } from "../primitives/freshness-pulse";
import { MonoNumber } from "../primitives/mono-number";
import { formatPrice, formatTimestampShort } from "../../lib/format";
import type { WhaleSignal } from "../../lib/stream/types";
import { cn } from "../../lib/utils";

export interface SignalCardProps {
  signal: WhaleSignal;
  isFreshest: boolean;
  isStale: boolean;
  onClick?: (signal: WhaleSignal) => void;
  className?: string;
}

function getSignalStrength(signal: WhaleSignal): "strong" | "weak" {
  return new Decimal(signal.score_notional).greaterThanOrEqualTo(
    new Decimal(signal.suggested_notional).times(5),
  )
    ? "strong"
    : "weak";
}

function SignalCardContent({
  signal,
  isStale,
}: {
  signal: WhaleSignal;
  isStale: boolean;
}) {
  const timestamp = formatTimestampShort(signal.latest_timestamp);
  const title =
    signal.title ?? signal.slug ?? signal.event_slug ?? signal.instrument_id;
  const outcome = signal.outcome ?? "Outcome unavailable";

  return (
    <>
      <div className="col-span-2 flex items-start">
        <BuySellPill side={signal.side} strength={getSignalStrength(signal)} />
      </div>

      <div className="col-span-5">
        <div
          data-mono
          className="text-2xs font-medium uppercase tracking-wider text-muted-steel"
        >
          SCORE NOTIONAL
        </div>
        <MonoNumber
          value={signal.score_notional}
          size="lg"
          variant="default"
          unit={null}
          compact
        />
      </div>

      <div className="col-span-5">
        <div
          data-mono
          className="text-2xs font-medium uppercase tracking-wider text-muted-steel"
        >
          SUGGESTED
        </div>
        <MonoNumber
          value={signal.suggested_notional}
          size="lg"
          variant="accent"
          unit="pUSD"
          compact
        />
      </div>

      <div className="col-span-12">
        <h3 className="line-clamp-2 text-md font-medium leading-snug text-bone">
          {title}
        </h3>
        <p className="mt-1 text-sm text-steel">{outcome}</p>
      </div>

      <div
        data-mono
        aria-label="Signal reference price"
        className="col-span-3 flex items-center gap-1 text-2xs"
      >
        <span className="font-medium uppercase text-ghost">REF</span>
        <MonoNumber
          value={signal.reference_price}
          size="2xs"
          variant="muted"
          display={formatPrice(signal.reference_price)}
        />
      </div>

      <div
        data-mono
        aria-label="Signal trade count"
        className="col-span-3 flex items-center gap-1 text-2xs"
      >
        <MonoNumber
          value={signal.trade_count}
          size="2xs"
          variant="muted"
          display={signal.trade_count.toString()}
        />
        <span className="font-medium uppercase text-ghost">TRADES</span>
      </div>

      <div
        data-mono
        aria-label="Signal wallet count"
        className="col-span-3 flex items-center gap-1 text-2xs"
      >
        <span className="font-medium uppercase text-ghost">WALLETS</span>
        <MonoNumber
          value={signal.wallets.length}
          size="2xs"
          variant="muted"
          display={signal.wallets.length.toString()}
        />
      </div>

      <div
        data-mono
        aria-label="Signal timestamp"
        className={cn(
          "col-span-3 text-right text-2xs font-medium tabular-nums",
          isStale ? "text-muted-steel" : "text-amber",
        )}
      >
        {timestamp}
      </div>
    </>
  );
}

export function SignalCard({
  signal,
  isFreshest,
  isStale,
  onClick,
  className,
}: SignalCardProps): React.ReactNode {
  const cardClassName = cn(
    "grid grid-cols-12 gap-x-4 gap-y-3 rounded-[12px] border border-whisper bg-edge px-6 py-5 text-left",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    isFreshest && "shadow-[inset_0_0_0_1px_rgba(217,119,87,0.35)]",
    isStale && "opacity-55",
    onClick && "w-full cursor-pointer hover:bg-edge/80",
    className,
  );

  const content = <SignalCardContent signal={signal} isStale={isStale} />;

  const card = onClick ? (
    <button
      type="button"
      className={cardClassName}
      onClick={() => onClick(signal)}
    >
      {content}
    </button>
  ) : (
    <article className={cardClassName}>{content}</article>
  );

  if (!isFreshest || isStale) {
    return card;
  }

  return (
    <FreshnessPulse active intensity={1}>
      {card}
    </FreshnessPulse>
  );
}
