import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ui/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("../../ui/sheet", () => ({
  Sheet: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <>{children}</> : null),
  SheetContent: ({
    children,
    side: _side,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) => (
    <div role="dialog" {...props}>
      {children}
    </div>
  ),
  SheetHeader: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  SheetTitle: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 {...props}>{children}</h2>,
}));

vi.mock("../../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({
    children,
    side: _side,
    sideOffset: _sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    side?: string;
    sideOffset?: number;
  }) => (
    <div role="tooltip" {...props}>
      {children}
    </div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { CommandDeck } from "../command-deck";
import { useCommandDeck } from "../command-deck-context";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function queryMatches(query: string) {
  const minWidth = query.match(/\(min-width:\s*(\d+)px\)/)?.[1];

  if (!minWidth) {
    return false;
  }

  return window.innerWidth >= Number(minWidth);
}

function renderDeck() {
  return render(
    <CommandDeck>
      <CommandDeck.Header>
        <span>Header controls</span>
      </CommandDeck.Header>
      <CommandDeck.RailLeft>
        <div>Left rail content</div>
      </CommandDeck.RailLeft>
      <CommandDeck.Main>
        <section>Main command content</section>
      </CommandDeck.Main>
      <CommandDeck.RailRight>
        <div>Right rail content</div>
      </CommandDeck.RailRight>
    </CommandDeck>,
  );
}

beforeEach(() => {
  setViewport(1400);
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: queryMatches(query),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

afterEach(cleanup);

describe("CommandDeck", () => {
  it("renders three inline regions at the lg breakpoint", () => {
    setViewport(1400);

    renderDeck();

    expect(screen.getByTestId("command-deck-grid")).toHaveAttribute(
      "data-breakpoint",
      "lg",
    );
    expect(screen.getByTestId("command-deck-grid")).toHaveClass(
      "grid-cols-[280px_minmax(0,1fr)_400px]",
    );
    expect(
      screen.getByTestId("command-deck-rail-left-inline"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("command-deck-main")).toBeInTheDocument();
    expect(
      screen.getByTestId("command-deck-rail-right-inline"),
    ).toBeInTheDocument();
  });

  it("moves the right rail into a sheet at the md breakpoint", async () => {
    const user = userEvent.setup();
    setViewport(1100);

    renderDeck();

    expect(screen.getByTestId("command-deck-grid")).toHaveClass(
      "grid-cols-[280px_minmax(0,1fr)]",
    );
    expect(
      screen.queryByTestId("command-deck-rail-right-inline"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Right rail content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open right rail" }));

    expect(await screen.findByText("Right rail content")).toBeInTheDocument();
  });

  it("collapses the left rail to a 64px strip at the sm breakpoint", () => {
    setViewport(900);

    renderDeck();

    const railLeft = screen.getByTestId("command-deck-rail-left-inline");

    expect(screen.getByTestId("command-deck-grid")).toHaveClass(
      "grid-cols-[64px_minmax(0,1fr)]",
    );
    expect(railLeft).toHaveAttribute("data-collapsed", "true");
    expect(railLeft).toHaveClass("w-16");
    expect(
      screen.queryByTestId("command-deck-rail-right-inline"),
    ).not.toBeInTheDocument();
  });

  it("moves both rails into sheets at the xs breakpoint", async () => {
    const user = userEvent.setup();
    setViewport(600);

    renderDeck();

    expect(screen.getByTestId("command-deck-grid")).toHaveClass(
      "grid-cols-1",
    );
    expect(
      screen.queryByTestId("command-deck-rail-left-inline"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("command-deck-rail-right-inline"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open left rail" }));
    expect(await screen.findByText("Left rail content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open right rail" }));
    expect(await screen.findByText("Right rail content")).toBeInTheDocument();
  });

  it("throws when useCommandDeck is read outside the provider", () => {
    function BrokenConsumer(): React.ReactNode {
      useCommandDeck();
      return null;
    }

    expect(() => render(<BrokenConsumer />)).toThrow(
      "CommandDeck.* must be used inside CommandDeck",
    );
  });
});
