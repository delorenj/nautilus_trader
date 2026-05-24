"use client";

import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

import { useCommandDeck } from "./command-deck-context";

export type HeaderProps = React.ComponentProps<"header">;

function HeaderToggle({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className="size-10 border border-whisper bg-edge text-steel hover:bg-plane hover:text-bone"
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function Header({
  children,
  className,
  ...props
}: HeaderProps): React.ReactNode {
  const { breakpoint, openLeftSheet, openRightSheet } = useCommandDeck();
  const showLeftToggle = breakpoint === "xs";
  const showRightToggle = breakpoint !== "lg";
  const showToggles = showLeftToggle || showRightToggle;

  return (
    <header
      data-testid="command-deck-header"
      data-command-deck-region="header"
      className={cn(
        "col-span-full flex min-h-14 items-center gap-3 rounded-[8px] border border-whisper bg-plane px-4 py-3",
        className,
      )}
      {...props}
    >
      <TooltipProvider>
        {showToggles && (
          <div className="flex shrink-0 items-center gap-2">
            {showLeftToggle && (
              <HeaderToggle label="Open left rail" onClick={openLeftSheet}>
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              </HeaderToggle>
            )}
            {showRightToggle && (
              <HeaderToggle label="Open right rail" onClick={openRightSheet}>
                <PanelRightOpen className="size-4" aria-hidden="true" />
              </HeaderToggle>
            )}
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {children}
        </div>
      </TooltipProvider>
    </header>
  );
}
