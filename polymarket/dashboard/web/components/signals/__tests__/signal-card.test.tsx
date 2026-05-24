import type { ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatTimestampShort } from "../../../lib/format";
import type { WhaleSignal } from "../../../lib/stream/types";
import { SignalCard } from "../signal-card";

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>(
    "motion/react",
  );

  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

const baseSignal: WhaleSignal = {
  condition_id: "condition-1",
  asset_id: "asset-1",
  instrument_id: "instrument-1",
  side: "BUY",
  score_notional: "12500",
  suggested_notional: "2000",
  reference_price: "0.4217",
  trade_count: 7,
  latest_timestamp: 1_792_575_730,
  wallets: ["0xabc", "0xdef"],
  title: "Will BTC close above 100k this Friday?",
  slug: "btc-above-100k-friday",
  event_slug: "btc-weekly",
  outcome: "Yes",
};

function renderSignalCard(
  props: Partial<ComponentProps<typeof SignalCard>> = {},
) {
  return render(
    <SignalCard
      signal={baseSignal}
      isFreshest={false}
      isStale={false}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("SignalCard", () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  it("renders signal data", () => {
    renderSignalCard();

    expect(screen.getByText(baseSignal.title as string)).toBeInTheDocument();
    expect(screen.getByText(baseSignal.outcome as string)).toBeInTheDocument();
    expect(screen.getByText("12.50k")).toBeInTheDocument();
    expect(screen.getByText("2.00k pUSD")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Signal wallet count")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("maps BUY signals to the teal BuySellPill classes", () => {
    renderSignalCard();

    expect(screen.getByText("\u25c6 BUY")).toHaveClass(
      "border-teal",
      "text-teal",
    );
  });

  it("adds the freshness ring and wraps freshest cards in FreshnessPulse", () => {
    renderSignalCard({ isFreshest: true });

    expect(screen.getByTestId("freshness-pulse")).toContainElement(
      screen.getByText(baseSignal.title as string).closest("article"),
    );
    expect(
      screen.getByText(baseSignal.title as string).closest("article"),
    ).toHaveClass("shadow-[inset_0_0_0_1px_rgba(217,119,87,0.35)]");
  });

  it("dims stale cards, mutes the timestamp, and does not pulse", () => {
    renderSignalCard({ isStale: true });

    expect(
      screen.getByText(baseSignal.title as string).closest("article"),
    ).toHaveClass("opacity-55");
    expect(
      screen.getByText(formatTimestampShort(baseSignal.latest_timestamp)),
    ).toHaveClass("text-muted-steel");
    expect(screen.queryByTestId("freshness-pulse")).not.toBeInTheDocument();
  });

  it("fires the click handler with the signal payload", () => {
    const onClick = vi.fn();

    renderSignalCard({ onClick });
    fireEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(baseSignal);
  });

  it("uses the strong glyph at the 5x threshold", () => {
    renderSignalCard({
      signal: {
        ...baseSignal,
        score_notional: "500",
        suggested_notional: "100",
      },
    });

    expect(screen.getByText("\u25c6 BUY")).toBeInTheDocument();
  });

  it("uses the weak glyph below the 5x threshold", () => {
    renderSignalCard({
      signal: {
        ...baseSignal,
        score_notional: "499.99",
        suggested_notional: "100",
      },
    });

    expect(screen.getByText("\u25c7 BUY")).toBeInTheDocument();
  });
});
