import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BuySellPill } from "../buy-sell-pill";

afterEach(cleanup);

describe("BuySellPill", () => {
  it("renders BUY with teal classes", () => {
    render(<BuySellPill side="BUY" />);

    expect(screen.getByText("\u25c7 BUY")).toHaveClass(
      "border-teal",
      "text-teal",
    );
  });

  it("renders SELL with rust classes", () => {
    render(<BuySellPill side="SELL" />);

    expect(screen.getByText("\u25c7 SELL")).toHaveClass(
      "border-rust",
      "text-rust",
    );
  });

  it("uses the strong glyph for strong signals", () => {
    render(<BuySellPill side="BUY" strength="strong" />);

    expect(screen.getByText("\u25c6 BUY")).toBeInTheDocument();
  });

  it("uses the weak glyph for weak signals", () => {
    render(<BuySellPill side="SELL" strength="weak" />);

    expect(screen.getByText("\u25c7 SELL")).toBeInTheDocument();
  });
});
