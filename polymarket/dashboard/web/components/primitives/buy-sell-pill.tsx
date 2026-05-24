"use client";

import { cn } from "../../lib/utils";

export type Side = "BUY" | "SELL";
export type SignalStrength = "strong" | "weak";

export interface BuySellPillProps {
  side: Side;
  strength?: SignalStrength;
  className?: string;
}

const sideClasses: Record<Side, string> = {
  BUY: "border-teal text-teal",
  SELL: "border-rust text-rust",
};

const strengthGlyphs: Record<SignalStrength, string> = {
  strong: "\u25c6",
  weak: "\u25c7",
};

export function BuySellPill({
  side,
  strength = "weak",
  className,
}: BuySellPillProps) {
  return (
    <span
      data-mono
      className={cn(
        "inline-flex h-[22px] items-center rounded-[0.375rem] border bg-transparent px-2 py-[2px] text-2xs font-medium uppercase leading-none tabular-nums",
        sideClasses[side],
        className,
      )}
    >
      {strengthGlyphs[strength]} {side}
    </span>
  );
}
