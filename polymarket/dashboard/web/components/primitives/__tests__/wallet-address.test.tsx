import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WalletAddress } from "../wallet-address";

vi.mock("../../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({
    children,
    sideOffset: _sideOffset,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }) => (
    <div role="tooltip" {...props}>
      {children}
    </div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const address = "0x1234567890abcdef";

afterEach(cleanup);

describe("WalletAddress", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it("truncates addresses by default", () => {
    render(<WalletAddress address={address} />);

    expect(screen.getByText("0x1234\u2026cdef")).toBeInTheDocument();
  });

  it("copies the full address when clicked", async () => {
    render(<WalletAddress address={address} />);
    fireEvent.click(screen.getByRole("button", { name: /copy identifier/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(address);
  });

  it("uses a label override while copying the real address", async () => {
    render(<WalletAddress address={address} label="BTC Momentum" />);
    fireEvent.click(screen.getByRole("button", { name: /copy identifier/i }));

    expect(screen.getByText("BTC Momentum")).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(address);
  });

  it("links an external explorer URL when provided", () => {
    render(
      <WalletAddress
        address={address}
        explorerUrl={`https://example.com/instruments/${address}`}
        explorerLabel="Open instrument"
      />,
    );

    expect(screen.getByRole("link", { name: /open instrument/i })).toHaveAttribute(
      "href",
      `https://example.com/instruments/${address}`,
    );
  });
});
