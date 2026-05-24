"use client";

import { motion, useReducedMotion } from "motion/react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

export type ConnectionName = "clob-ws" | "data-api" | "bot-bus";
export type LatencyTier = "ok" | "warn" | "bad" | "unknown";

export interface ConnectionBadgeProps {
  name: ConnectionName;
  latencyMs: number | null;
  tier: LatencyTier;
  sparkline?: number[];
  className?: string;
}

const tierClasses: Record<LatencyTier, string> = {
  ok: "border-whisper text-bone",
  warn: "border-sand/60 text-sand",
  bad: "border-rust/60 text-rust",
  unknown: "border-whisper text-muted-steel",
};

const dotClasses: Record<LatencyTier, string> = {
  ok: "bg-teal",
  warn: "bg-sand",
  bad: "bg-rust",
  unknown: "bg-muted-steel",
};

function Sparkline({ values }: { values: number[] }) {
  const samples = values.slice(-60).filter(Number.isFinite);

  if (samples.length === 0) {
    return <span data-mono>no recent samples</span>;
  }

  const width = 60;
  const height = 16;
  const padding = 2;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min || 1;
  const divisor = Math.max(samples.length - 1, 1);
  const path = samples
    .map((sample, index) => {
      const x = (index / divisor) * width;
      const ratio = (sample - min) / range;
      const y = padding + (1 - ratio) * (height - padding * 2);

      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      data-testid="connection-sparkline"
      role="img"
      aria-label="Latency sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function StatusDot({
  tier,
  reducedMotion,
}: {
  tier: LatencyTier;
  reducedMotion: boolean | null;
}) {
  const animated = (tier === "ok" || tier === "warn") && !reducedMotion;
  const className = cn("size-1.5 rounded-full", dotClasses[tier]);

  if (!animated) {
    return <span aria-hidden="true" className={className} />;
  }

  return (
    <motion.span
      aria-hidden="true"
      className={className}
      animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
      transition={{
        duration: tier === "warn" ? 0.6 : 1.6,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    />
  );
}

export function ConnectionBadge({
  name,
  latencyMs,
  tier,
  sparkline,
  className,
}: ConnectionBadgeProps) {
  const reducedMotion = useReducedMotion();
  const latencyLabel = latencyMs == null ? "\u2014" : `${latencyMs}ms`;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          data-mono
          data-testid="connection-badge"
          className={cn(
            "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 py-[2px] text-2xs font-medium tabular-nums",
            tierClasses[tier],
            className,
          )}
        >
          <StatusDot tier={tier} reducedMotion={reducedMotion} />
          <span>{name}</span>
          <span>{latencyLabel}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        data-mono
        sideOffset={4}
        className={cn(
          "border border-whisper bg-plane text-bone",
          sparkline && sparkline.length > 0 ? "px-2 py-2" : undefined,
        )}
      >
        {sparkline && sparkline.length > 0 ? (
          <Sparkline values={sparkline} />
        ) : (
          <span data-mono>no recent samples</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
