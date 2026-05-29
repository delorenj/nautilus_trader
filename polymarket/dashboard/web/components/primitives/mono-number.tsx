"use client";

import type Decimal from "decimal.js";

import { formatNotional, formatPercent } from "../../lib/format";
import { cn } from "../../lib/utils";

export type MonoNumberSize =
  | "2xs"
  | "xs"
  | "sm"
  | "base"
  | "md"
  | "lg"
  | "xl"
  | "2xl";

export type MonoNumberVariant =
  | "default"
  | "positive"
  | "negative"
  | "muted"
  | "accent";

export type MonoNumberUnit = "USD" | "%" | null;

export interface MonoNumberProps {
  value: Decimal | string | number | null | undefined;
  size?: MonoNumberSize;
  variant?: MonoNumberVariant;
  unit?: MonoNumberUnit;
  compact?: boolean;
  precision?: number;
  className?: string;
  display?: string;
}

const sizeClasses: Record<MonoNumberSize, string> = {
  "2xs": "text-2xs",
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  md: "text-md",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

const variantClasses: Record<MonoNumberVariant, string> = {
  default: "text-bone",
  positive: "text-teal",
  negative: "text-rust",
  muted: "text-muted-steel",
  accent: "text-amber",
};

export function MonoNumber({
  value,
  size = "sm",
  variant = "default",
  unit = null,
  compact = false,
  precision,
  className,
  display,
}: MonoNumberProps) {
  const formatted =
    value == null
      ? "\u2014"
      : display ??
        (unit === "%"
          ? formatPercent(value, {
              precision,
              signed: variant === "positive" || variant === "negative",
            })
          : formatNotional(value, { compact, precision, unit }));

  return (
    <span
      data-mono
      className={cn(
        "font-medium tabular-nums",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
    >
      {formatted}
    </span>
  );
}
