"use client";

import type * as React from "react";

import { cn } from "../../lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

import {
  CommandDeckProvider,
  useCommandDeck,
} from "./command-deck-context";
import { Header } from "./header";

export interface CommandDeckProps {
  children: React.ReactNode;
  className?: string;
}

export interface CommandDeckSlotProps {
  children: React.ReactNode;
  className?: string;
}

function CommandDeckShell({
  children,
  className,
}: CommandDeckProps): React.ReactNode {
  const { breakpoint } = useCommandDeck();

  return (
    <div
      data-testid="command-deck"
      className={cn(
        "mx-auto min-h-[100dvh] w-full max-w-[1480px] bg-canvas px-[clamp(16px,2vw,32px)] py-[clamp(20px,2.5vw,36px)] text-bone",
        className,
      )}
    >
      <div
        data-testid="command-deck-grid"
        data-breakpoint={breakpoint}
        className={cn(
          "grid gap-5",
          breakpoint === "lg" &&
            "grid-cols-[280px_minmax(0,1fr)_400px]",
          breakpoint === "md" && "grid-cols-[280px_minmax(0,1fr)]",
          breakpoint === "sm" && "grid-cols-[64px_minmax(0,1fr)]",
          breakpoint === "xs" && "grid-cols-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function RailLeft({ children, className }: CommandDeckSlotProps) {
  const {
    breakpoint,
    leftSheetOpen,
    openLeftSheet,
    closeLeftSheet,
  } = useCommandDeck();

  if (breakpoint === "xs") {
    return (
      <Sheet
        open={leftSheetOpen}
        onOpenChange={(open) =>
          open ? openLeftSheet() : closeLeftSheet()
        }
      >
        <SheetContent
          side="left"
          className="w-full max-w-none border-whisper bg-plane p-0 text-bone sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Left command rail</SheetTitle>
          </SheetHeader>
          <div className={cn("h-full overflow-y-auto p-4", className)}>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      data-testid="command-deck-rail-left-inline"
      data-command-deck-region="rail-left"
      data-collapsed={breakpoint === "sm" ? "true" : "false"}
      className={cn(
        "min-w-0 overflow-hidden rounded-[8px] border border-whisper bg-plane",
        breakpoint === "sm" ? "w-16" : "w-[280px]",
        className,
      )}
    >
      {children}
    </aside>
  );
}

function Main({ children, className }: CommandDeckSlotProps) {
  return (
    <main
      data-testid="command-deck-main"
      data-command-deck-region="main"
      className={cn(
        "flex min-w-0 flex-col gap-[clamp(20px,2.5vw,36px)]",
        className,
      )}
    >
      {children}
    </main>
  );
}

function RailRight({ children, className }: CommandDeckSlotProps) {
  const {
    breakpoint,
    rightSheetOpen,
    openRightSheet,
    closeRightSheet,
  } = useCommandDeck();

  if (breakpoint === "lg") {
    return (
      <aside
        data-testid="command-deck-rail-right-inline"
        data-command-deck-region="rail-right"
        className={cn(
          "min-w-0 overflow-hidden rounded-[8px] border border-whisper bg-plane",
          "w-[400px]",
          className,
        )}
      >
        {children}
      </aside>
    );
  }

  return (
    <Sheet
      open={rightSheetOpen}
      onOpenChange={(open) =>
        open ? openRightSheet() : closeRightSheet()
      }
    >
      <SheetContent
        side="right"
        className={cn(
          "max-w-none border-whisper bg-plane p-0 text-bone sm:max-w-none",
          breakpoint === "xs" ? "w-full" : "w-full max-w-[420px]",
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Right command rail</SheetTitle>
        </SheetHeader>
        <div className={cn("h-full overflow-y-auto p-4", className)}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CommandDeck({
  children,
  className,
}: CommandDeckProps): React.ReactNode {
  return (
    <CommandDeckProvider>
      <CommandDeckShell className={className}>{children}</CommandDeckShell>
    </CommandDeckProvider>
  );
}

CommandDeck.RailLeft = RailLeft;
CommandDeck.Main = Main;
CommandDeck.RailRight = RailRight;
CommandDeck.Header = Header;
