import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatTimestampShort, truncateWallet } from "../../../lib/format";
import type { WhaleTrade } from "../../../lib/stream/types";
import { TradeTapeRow } from "../trade-tape-row";

vi.mock("../../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const baseTrade: WhaleTrade = {
  wallet: "0x1234567890abcdef1234567890abcdef12345678",
  side: "BUY",
  asset_id: "asset-1",
  condition_id: "condition-1",
  size: "250.5",
  price: "0.4217",
  notional: "6100",
  timestamp: 1_792_575_730,
  title: "BTC/USDT momentum impulse",
  slug: "btcusdt-momentum-impulse",
  event_slug: "kraken-btcusdt",
  outcome: "Momentum long",
  outcome_index: 0,
  name: "BTC Momentum",
  pseudonym: "BTC Momentum",
  transaction_hash: "0xtrade1",
};

function renderTradeTapeRow(trade: WhaleTrade = baseTrade) {
  return render(<TradeTapeRow trade={trade} />);
}

afterEach(cleanup);

describe("TradeTapeRow", () => {
  it("renders the spot signal data in a compact row", () => {
    renderTradeTapeRow();

    expect(screen.getByText("BTC Momentum")).toBeInTheDocument();
    expect(screen.getByText("\u25c6 BUY")).toBeInTheDocument();
    expect(screen.getByText("250.50")).toBeInTheDocument();
    expect(screen.getByText("0.4217")).toBeInTheDocument();
    expect(screen.getByText("6.10k USD")).toBeInTheDocument();
    expect(screen.getByText(baseTrade.title as string)).toBeInTheDocument();
    expect(
      screen.getByText(formatTimestampShort(baseTrade.timestamp)),
    ).toBeInTheDocument();
  });

  it("uses a button and fires onClick with the trade when interactive", () => {
    const onClick = vi.fn();

    render(<TradeTapeRow trade={baseTrade} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(baseTrade);
  });

  it("uses a div when no click handler is supplied", () => {
    const { container } = renderTradeTapeRow();

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.firstElementChild?.tagName).toBe("DIV");
  });

  it("falls back to a truncated wallet label when pseudonym is missing", () => {
    renderTradeTapeRow({ ...baseTrade, pseudonym: null });

    expect(
      screen.getByText(truncateWallet(baseTrade.wallet)),
    ).toBeInTheDocument();
  });

  it("renders SELL notional as negative and weak under the notional threshold", () => {
    renderTradeTapeRow({
      ...baseTrade,
      side: "SELL",
      notional: "5000",
      transaction_hash: "0xtrade2",
    });

    expect(screen.getByText("\u25c7 SELL")).toBeInTheDocument();
    expect(screen.getByText("5.00k USD")).toHaveClass("text-rust");
  });
});
