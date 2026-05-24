import { cleanup, render, screen } from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreshnessPulse } from "../freshness-pulse";

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

afterEach(cleanup);

describe("FreshnessPulse", () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  it("wraps active children in a motion div", () => {
    render(
      <FreshnessPulse active>
        <span>fresh</span>
      </FreshnessPulse>,
    );

    expect(screen.getByTestId("freshness-pulse")).toContainElement(
      screen.getByText("fresh"),
    );
  });

  it("returns children directly when inactive", () => {
    render(
      <FreshnessPulse active={false}>
        <span>quiet</span>
      </FreshnessPulse>,
    );

    expect(screen.queryByTestId("freshness-pulse")).not.toBeInTheDocument();
    expect(screen.getByText("quiet")).toBeInTheDocument();
  });

  it("returns children directly when reduced motion is preferred", () => {
    mockedUseReducedMotion.mockReturnValue(true);

    render(
      <FreshnessPulse active>
        <span>still</span>
      </FreshnessPulse>,
    );

    expect(screen.queryByTestId("freshness-pulse")).not.toBeInTheDocument();
    expect(screen.getByText("still")).toBeInTheDocument();
  });
});
