import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useBrowserQueryState } from "./use-browser-query-state";

function Harness() {
  const [live, setLive] = useBrowserQueryState("live", {
    defaultValue: "1",
  });

  return (
    <div>
      <span>{live}</span>
      <button type="button" onClick={() => setLive("0")}>
        pause
      </button>
      <button type="button" onClick={() => setLive("1")}>
        live
      </button>
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(cleanup);

describe("useBrowserQueryState", () => {
  it("hydrates from the URL after mount", async () => {
    window.history.replaceState(null, "", "/?live=0");

    render(<Harness />);

    expect(await screen.findByText("0")).toBeInTheDocument();
  });

  it("updates and removes default query params", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "pause" }));
    expect(window.location.search).toBe("?live=0");

    await user.click(screen.getByRole("button", { name: "live" }));
    expect(window.location.search).toBe("");
  });
});
