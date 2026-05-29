import * as React from "react";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { WhaleTrade } from "../../../lib/stream/types";
import { WhaleTape } from "../whale-tape";

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

vi.mock("../../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const wallets = {
  alpha: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  beta: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  gamma: "0xcccccccccccccccccccccccccccccccccccccccc",
};

function makeTrade(
  index: number,
  overrides: Partial<WhaleTrade> = {},
): WhaleTrade {
  return {
    wallet: wallets.alpha,
    side: index % 2 === 0 ? "BUY" : "SELL",
    asset_id: `asset-${index}`,
    condition_id: `condition-${index}`,
    size: `${100 + index}`,
    price: "0.4200",
    notional: `${1000 + index}`,
    timestamp: 1_792_575_730 + index,
    title: `BTC/USDT signal ${index}`,
    slug: `btcusdt-signal-${index}`,
    event_slug: "kraken-btcusdt",
    outcome: "Momentum long",
    outcome_index: 0,
    name: null,
    pseudonym: `Source ${index}`,
    transaction_hash: `0xtrade${index}`,
    ...overrides,
  };
}

const baseTrades: WhaleTrade[] = [
  makeTrade(0, {
    wallet: wallets.alpha,
    side: "BUY",
    title: "Newest BUY from alpha",
  }),
  makeTrade(1, {
    wallet: wallets.beta,
    side: "SELL",
    title: "Middle SELL from beta",
  }),
  makeTrade(2, {
    wallet: wallets.gamma,
    side: "BUY",
    title: "Old BUY from gamma",
  }),
];

function renderWhaleTape(
  props: Partial<React.ComponentProps<typeof WhaleTape>> = {},
) {
  return render(
    <div style={{ height: 600 }}>
      <WhaleTape trades={baseTrades} {...props} />
    </div>,
  );
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  mockedUseReducedMotion.mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 1000,
    height: 600,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 600,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockedUseReducedMotion.mockReturnValue(false);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("WhaleTape", () => {
  it("renders all visible trades", () => {
    renderWhaleTape();

    expect(screen.getByText("Newest BUY from alpha")).toBeInTheDocument();
    expect(screen.getByText("Middle SELL from beta")).toBeInTheDocument();
    expect(screen.getByText("Old BUY from gamma")).toBeInTheDocument();
  });

  it("filterBySide narrows the list", () => {
    renderWhaleTape({ filterBySide: "SELL" });

    expect(screen.queryByText("Newest BUY from alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Middle SELL from beta")).toBeInTheDocument();
    expect(screen.queryByText("Old BUY from gamma")).not.toBeInTheDocument();
  });

  it("filterByWallet matches the right rows", () => {
    renderWhaleTape({ filterByWallet: [wallets.gamma] });

    expect(screen.queryByText("Newest BUY from alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Middle SELL from beta")).not.toBeInTheDocument();
    expect(screen.getByText("Old BUY from gamma")).toBeInTheDocument();
  });

  it("onRowClick fires with the trade", () => {
    const onRowClick = vi.fn();

    renderWhaleTape({ onRowClick });
    fireEvent.click(
      screen.getByText("Newest BUY from alpha").closest("button") as HTMLElement,
    );

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(baseTrades[0]);
  });

  it("wraps initial rows in motion when staggerOnMount is true", () => {
    const { container } = renderWhaleTape({ staggerOnMount: true });

    expect(
      container.querySelectorAll("[data-motion-row]").length,
    ).toBeGreaterThan(0);
  });

  it("does not wrap initial rows in motion when staggerOnMount is false", () => {
    const { container } = renderWhaleTape({ staggerOnMount: false });

    expect(container.querySelectorAll("[data-motion-row]")).toHaveLength(0);
  });

  it("honors prefers-reduced-motion by disabling animation wrappers", () => {
    mockedUseReducedMotion.mockReturnValue(true);

    const { container } = renderWhaleTape({ staggerOnMount: true });

    expect(container.querySelectorAll("[data-motion-row]")).toHaveLength(0);
  });

  it("renders a bounded number of DOM rows for 1000+ trades", () => {
    const manyTrades = Array.from({ length: 1_200 }, (_, index) =>
      makeTrade(index, {
        title: `Large Tape Market ${index}`,
        transaction_hash: `0xlarge${index}`,
      }),
    );
    const { container } = render(
      <div style={{ height: 600 }}>
        <WhaleTape trades={manyTrades} staggerOnMount={false} />
      </div>,
    );

    expect(container.querySelectorAll("[data-row]").length).toBeLessThanOrEqual(
      30,
    );
    expect(screen.getByText("Large Tape Market 0")).toBeInTheDocument();
  });
});
