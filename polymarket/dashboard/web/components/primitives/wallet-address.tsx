"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { truncateWallet } from "../../lib/format";
import { cn } from "../../lib/utils";

export interface WalletAddressProps {
  address: string;
  leading?: number;
  trailing?: number;
  copyable?: boolean;
  explorerUrl?: string;
  explorerLabel?: string;
  size?: "2xs" | "xs" | "sm";
  className?: string;
  label?: string;
}

const sizeClasses: Record<NonNullable<WalletAddressProps["size"]>, string> = {
  "2xs": "text-2xs",
  xs: "text-xs",
  sm: "text-sm",
};

export function WalletAddress({
  address,
  leading = 4,
  trailing = 4,
  copyable = true,
  explorerUrl,
  explorerLabel = "Open identifier externally",
  size = "sm",
  className,
  label,
}: WalletAddressProps) {
  const [copied, setCopied] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayAddress = label ?? truncateWallet(address, leading, trailing);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTooltipOpen(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      setTooltipOpen(false);
    }, 1500);
  }

  const addressText = (
    <span data-mono className="tabular-nums">
      {displayAddress}
    </span>
  );

  const addressControl = copyable ? (
    <Tooltip
      delayDuration={0}
      open={tooltipOpen}
      onOpenChange={setTooltipOpen}
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          data-mono
          onClick={handleCopy}
          className={cn(
            "inline-flex items-center rounded-sm text-left font-medium tabular-nums transition-colors hover:text-bone focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber",
            sizeClasses[size],
          )}
          aria-label={`Copy identifier ${address}`}
        >
          {addressText}
        </button>
      </TooltipTrigger>
      <TooltipContent
        data-mono
        sideOffset={4}
        className="border border-whisper bg-plane text-bone"
      >
        {copied ? "Copied" : address}
      </TooltipContent>
    </Tooltip>
  ) : (
    <span
      data-mono
      className={cn("font-medium tabular-nums", sizeClasses[size])}
    >
      {displayAddress}
    </span>
  );

  return (
    <span
      data-mono
      className={cn(
        "inline-flex items-center gap-1.5 text-muted-steel",
        sizeClasses[size],
        className,
      )}
    >
      {addressControl}
      {explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-muted-steel transition-colors hover:text-bone focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber"
          aria-label={explorerLabel}
        >
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : null}
    </span>
  );
}
