"use client";

import * as React from "react";
import Decimal from "decimal.js";
import { ChevronRight } from "lucide-react";

import { BuySellPill } from "../primitives/buy-sell-pill";
import { MonoNumber } from "../primitives/mono-number";
import { WalletAddress } from "../primitives/wallet-address";
import {
  formatPrice,
  formatTimestampShort,
  truncateWallet,
} from "../../lib/format";
import type { WhaleTrade } from "../../lib/stream/types";
import { cn } from "../../lib/utils";

export interface TradeTapeRowProps {
  trade: WhaleTrade;
  onClick?: (trade: WhaleTrade) => void;
  className?: string;
}

function getTradeStrength(trade: WhaleTrade): "strong" | "weak" {
  return new Decimal(trade.notional).greaterThan(new Decimal(5000))
    ? "strong"
    : "weak";
}

function getTradeTitle(trade: WhaleTrade): string {
  return (
    trade.title ??
    trade.slug ??
    trade.event_slug ??
    trade.outcome ??
    trade.condition_id
  );
}

function TradeTapeRowContent({ trade }: { trade: WhaleTrade }) {
  return (
    <>
      <WalletAddress
        address={trade.wallet}
        size="2xs"
        copyable={false}
        label={trade.pseudonym ?? truncateWallet(trade.wallet)}
        className="shrink-0"
      />
      <BuySellPill side={trade.side} strength={getTradeStrength(trade)} />
      <MonoNumber
        value={trade.size}
        size="2xs"
        variant="muted"
        unit={null}
        className="shrink-0"
      />
      <MonoNumber
        value={trade.price}
        size="2xs"
        variant="muted"
        display={formatPrice(trade.price)}
        className="shrink-0"
      />
      <MonoNumber
        value={trade.notional}
        size="xs"
        variant={trade.side === "BUY" ? "positive" : "negative"}
        compact
        unit="USD"
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-bone">
        {getTradeTitle(trade)}
      </span>
      <span className="ml-auto whitespace-nowrap font-mono text-2xs text-muted-steel">
        {formatTimestampShort(trade.timestamp)}
      </span>
      <ChevronRight
        size={14}
        aria-hidden="true"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </>
  );
}

export function TradeTapeRow({
  trade,
  onClick,
  className,
}: TradeTapeRowProps): React.ReactNode {
  const rowClassName = cn(
    "group flex h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-halo)]",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber focus-visible:ring-inset",
    onClick && "cursor-pointer",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={rowClassName}
        onClick={() => onClick(trade)}
      >
        <TradeTapeRowContent trade={trade} />
      </button>
    );
  }

  return (
    <div className={rowClassName}>
      <TradeTapeRowContent trade={trade} />
    </div>
  );
}
