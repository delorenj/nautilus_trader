"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, useReducedMotion } from "motion/react";

import type { WhaleTrade } from "../../lib/stream/types";
import { cn } from "../../lib/utils";
import { TradeTapeRow } from "./trade-tape-row";

export interface WhaleTapeProps {
  trades: WhaleTrade[];
  filterByWallet?: string[];
  filterBySide?: "BUY" | "SELL" | null;
  onRowClick?: (trade: WhaleTrade) => void;
  /** Render initial mount with stagger. After first paint, subsequent appends use slide-in. */
  staggerOnMount?: boolean;
  className?: string;
}

const ROW_HEIGHT = 56;
const STAGGER_LIMIT = 30;
const INITIAL_VIEWPORT_HEIGHT = 600;

type TapeVirtualItem = {
  index: number;
  start: number;
  size: number;
};

type TapeAnimationState = {
  initialY: number;
  delay: number;
};

function getTradeKey(trade: WhaleTrade, index: number): string {
  return `${trade.transaction_hash ?? trade.timestamp}-${trade.wallet}-${index}`;
}

function getAnimationState({
  index,
  hasSeen,
  hasPainted,
  staggerOnMount,
}: {
  index: number;
  hasSeen: boolean;
  hasPainted: boolean;
  staggerOnMount: boolean;
}) {
  if (hasSeen) {
    return null;
  }

  if (!hasPainted && staggerOnMount) {
    return {
      initialY: 8,
      delay: Math.min(index, STAGGER_LIMIT) * 0.05,
    };
  }

  if (hasPainted && index === 0) {
    return {
      initialY: -8,
      delay: 0,
    };
  }

  return null;
}

function getInitialVirtualItems(count: number): TapeVirtualItem[] {
  const visibleCount = Math.min(
    count,
    Math.ceil(INITIAL_VIEWPORT_HEIGHT / ROW_HEIGHT) + 8,
  );

  return Array.from({ length: visibleCount }, (_, index) => ({
    index,
    start: index * ROW_HEIGHT,
    size: ROW_HEIGHT,
  }));
}

export function WhaleTape({
  trades,
  filterByWallet,
  filterBySide = null,
  onRowClick,
  staggerOnMount = true,
  className,
}: WhaleTapeProps): React.ReactNode {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const seenTradeKeysRef = React.useRef<Set<string>>(new Set());
  const animatedTradeKeysRef = React.useRef<Map<string, TapeAnimationState>>(
    new Map(),
  );
  const renderedTradeKeysRef = React.useRef<string[]>([]);
  const hasPaintedRef = React.useRef(false);
  const prefersReducedMotion = useReducedMotion();

  renderedTradeKeysRef.current = [];

  React.useEffect(() => {
    for (const tradeKey of renderedTradeKeysRef.current) {
      seenTradeKeysRef.current.add(tradeKey);
    }
  });

  React.useEffect(() => {
    hasPaintedRef.current = true;
  }, []);

  const visibleTrades = React.useMemo(() => {
    const walletFilter =
      filterByWallet && filterByWallet.length > 0
        ? new Set(filterByWallet)
        : null;

    return trades.filter((trade) => {
      const walletMatches =
        walletFilter === null || walletFilter.has(trade.wallet);
      const sideMatches =
        filterBySide == null || trade.side === filterBySide;

      return walletMatches && sideMatches;
    });
  }, [filterBySide, filterByWallet, trades]);

  const rowVirtualizer = useVirtualizer({
    count: visibleTrades.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => {
      const trade = visibleTrades[index];

      return trade ? getTradeKey(trade, index) : index;
    },
    initialRect: {
      height: INITIAL_VIEWPORT_HEIGHT,
      width: 0,
    },
    overscan: 8,
  });

  const measuredVirtualItems = rowVirtualizer.getVirtualItems();
  const virtualItems =
    measuredVirtualItems.length > 0
      ? measuredVirtualItems
      : getInitialVirtualItems(visibleTrades.length);
  const disableMotion = Boolean(prefersReducedMotion);

  return (
    <div
      ref={scrollRef}
      data-whale-tape-viewport
      className={cn("relative h-full overflow-auto", className)}
    >
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const trade = visibleTrades[virtualItem.index];

          if (!trade) {
            return null;
          }

          const tradeKey = getTradeKey(trade, virtualItem.index);
          const hasSeen = seenTradeKeysRef.current.has(tradeKey);
          const animationState = disableMotion
            ? null
            : animatedTradeKeysRef.current.get(tradeKey) ??
              getAnimationState({
                index: virtualItem.index,
                hasSeen,
                hasPainted: hasPaintedRef.current,
                staggerOnMount,
              });

          if (animationState && !animatedTradeKeysRef.current.has(tradeKey)) {
            animatedTradeKeysRef.current.set(tradeKey, animationState);
          }

          renderedTradeKeysRef.current.push(tradeKey);

          const row = (
            <TradeTapeRow
              trade={trade}
              onClick={onRowClick}
              className="border-b border-whisper"
            />
          );

          const wrapperStyle: React.CSSProperties = {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: virtualItem.size,
            transform: `translateY(${virtualItem.start}px)`,
          };

          if (animationState) {
            return (
              <motion.div
                key={tradeKey}
                data-row
                data-motion-row="true"
                style={wrapperStyle}
                initial={{ opacity: 0, y: animationState.initialY }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: animationState.delay,
                  duration: 0.24,
                  type: "spring",
                  stiffness: 100,
                  damping: 20,
                }}
              >
                {row}
              </motion.div>
            );
          }

          return (
            <div key={tradeKey} data-row style={wrapperStyle}>
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}
