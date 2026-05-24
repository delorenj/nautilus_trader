import { cleanup, render, screen } from "@testing-library/react";
import Decimal from "decimal.js";
import { afterEach, describe, expect, it } from "vitest";

import { MonoNumber } from "../mono-number";

afterEach(cleanup);

describe("MonoNumber", () => {
  it("renders formatted notional values", () => {
    render(<MonoNumber value={new Decimal("1234.5")} unit="USD" />);

    expect(screen.getByText("1,234.50 USD")).toBeInTheDocument();
  });

  it("maps variants to color classes", () => {
    render(<MonoNumber value="42" variant="positive" />);

    expect(screen.getByText("42.00")).toHaveClass("text-teal");
  });

  it("renders an em dash for nullish values", () => {
    render(<MonoNumber value={null} display="ready" />);

    expect(screen.getByText("\u2014")).toBeInTheDocument();
  });

  it("uses formatPercent for percent units", () => {
    render(<MonoNumber value="0.0856" unit="%" variant="positive" />);

    expect(screen.getByText("+8.56%")).toBeInTheDocument();
  });

  it("maps sizes to text classes", () => {
    render(<MonoNumber value="42" size="xl" />);

    expect(screen.getByText("42.00")).toHaveClass("text-xl");
  });
});
