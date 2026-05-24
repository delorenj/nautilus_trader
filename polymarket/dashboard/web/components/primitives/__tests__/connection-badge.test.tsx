import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionBadge } from "../connection-badge";

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

afterEach(cleanup);

function renderWithTooltip(children: React.ReactNode) {
  return render(<>{children}</>);
}

describe("ConnectionBadge", () => {
  it("maps tiers to border and text classes", () => {
    renderWithTooltip(
      <ConnectionBadge name="clob-ws" latencyMs={92} tier="warn" />,
    );

    expect(screen.getByTestId("connection-badge")).toHaveClass(
      "border-sand/60",
      "text-sand",
    );
  });

  it("renders the connection name and latency", () => {
    renderWithTooltip(
      <ConnectionBadge name="data-api" latencyMs={41} tier="ok" />,
    );

    expect(screen.getByText("data-api")).toBeInTheDocument();
    expect(screen.getByText("41ms")).toBeInTheDocument();
  });

  it("surfaces a sparkline chart in the tooltip", async () => {
    const user = userEvent.setup();

    renderWithTooltip(
      <ConnectionBadge
        name="bot-bus"
        latencyMs={109}
        tier="bad"
        sparkline={[80, 92, 88, 109]}
      />,
    );

    await user.hover(screen.getByTestId("connection-badge"));

    expect(await screen.findByTestId("connection-sparkline")).toBeInTheDocument();
  });
});
