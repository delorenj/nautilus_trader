"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Breakpoint = "lg" | "md" | "sm" | "xs";

export interface CommandDeckContextValue {
  breakpoint: Breakpoint;
  leftSheetOpen: boolean;
  rightSheetOpen: boolean;
  openLeftSheet(): void;
  closeLeftSheet(): void;
  openRightSheet(): void;
  closeRightSheet(): void;
}

const CommandDeckContext = createContext<CommandDeckContextValue | null>(null);

function getBreakpointFromViewport(): Breakpoint {
  if (typeof window === "undefined") {
    return "lg";
  }

  if (window.innerWidth >= 1280) {
    return "lg";
  }

  if (window.innerWidth >= 1024) {
    return "md";
  }

  if (window.innerWidth >= 768) {
    return "sm";
  }

  return "xs";
}

export function CommandDeckProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg");
  const [leftSheetOpen, setLeftSheetOpen] = useState(false);
  const [rightSheetOpen, setRightSheetOpen] = useState(false);

  useEffect(() => {
    const updateBreakpoint = () => {
      setBreakpoint(getBreakpointFromViewport());
    };

    const mediaQueries =
      typeof window.matchMedia === "function"
        ? [
            window.matchMedia("(min-width: 1280px)"),
            window.matchMedia("(min-width: 1024px)"),
            window.matchMedia("(min-width: 768px)"),
          ]
        : [];

    mediaQueries.forEach((mediaQuery) => {
      mediaQuery.addEventListener("change", updateBreakpoint);
    });
    window.addEventListener("resize", updateBreakpoint);
    updateBreakpoint();

    return () => {
      mediaQueries.forEach((mediaQuery) => {
        mediaQuery.removeEventListener("change", updateBreakpoint);
      });
      window.removeEventListener("resize", updateBreakpoint);
    };
  }, []);

  const openLeftSheet = useCallback(() => {
    setLeftSheetOpen(true);
  }, []);

  const closeLeftSheet = useCallback(() => {
    setLeftSheetOpen(false);
  }, []);

  const openRightSheet = useCallback(() => {
    setRightSheetOpen(true);
  }, []);

  const closeRightSheet = useCallback(() => {
    setRightSheetOpen(false);
  }, []);

  const value = useMemo<CommandDeckContextValue>(
    () => ({
      breakpoint,
      leftSheetOpen,
      rightSheetOpen,
      openLeftSheet,
      closeLeftSheet,
      openRightSheet,
      closeRightSheet,
    }),
    [
      breakpoint,
      closeLeftSheet,
      closeRightSheet,
      leftSheetOpen,
      openLeftSheet,
      openRightSheet,
      rightSheetOpen,
    ],
  );

  return (
    <CommandDeckContext.Provider value={value}>
      {children}
    </CommandDeckContext.Provider>
  );
}

export function useCommandDeck(): CommandDeckContextValue {
  const context = use(CommandDeckContext);

  if (!context) {
    throw new Error("CommandDeck.* must be used inside CommandDeck");
  }

  return context;
}
