import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildKrakenSpotRunCommand } from "./runner";

describe("Kraken Spot runner command", () => {
  it("builds the paper-cycle command from the dashboard package", () => {
    const cwd = "/workspace/nautilus_trader/polymarket/dashboard/web";
    const command = buildKrakenSpotRunCommand(
      {
        scenario: "timebox",
        source: "simulated",
        symbols: ["btc/usdt", "eth/usdt"],
        scenarioSequence: ["timebox", "no-entry", "target"],
        cycleCount: "3",
        riskBudgetUsd: "15",
        phaseDelaySecs: "2",
        varDir: "/tmp/kraken-autonomy",
      },
      cwd,
    );

    const repoRoot = resolve(cwd, "../../..");

    expect(command.repoRoot).toBe(repoRoot);
    expect(command.pythonPath).toBe(join(repoRoot, ".venv/bin/python"));
    expect(command.scriptPath).toBe(
      join(repoRoot, "examples/live/kraken/kraken_spot_autonomy_bot.py"),
    );
    expect(command.args).toEqual([
      command.scriptPath,
      "--source",
      "simulated",
      "--scenario",
      "timebox",
      "--scenario-sequence",
      "timebox,no-entry,target",
      "--cycle-count",
      "3",
      "--symbol",
      "BTC/USDT",
      "--symbol",
      "ETH/USDT",
      "--risk-budget-usd",
      "15",
      "--phase-delay-secs",
      "2",
      "--var-dir",
      "/tmp/kraken-autonomy",
    ]);
  });

  it("falls back to a safe simulated paper run", () => {
    const unsafeRequest = {
      scenario: "not-real",
      source: "not-real",
      symbols: [],
      riskBudgetUsd: "",
      phaseDelaySecs: "",
      varDir: "/tmp/kraken-autonomy",
    } as unknown as Parameters<typeof buildKrakenSpotRunCommand>[0];

    const command = buildKrakenSpotRunCommand(
      unsafeRequest,
      "/workspace/nautilus_trader/polymarket/dashboard/web",
    );

    expect(command.scenario).toBe("target");
    expect(command.source).toBe("simulated");
    expect(command.symbols).toEqual(["BTC/USDT", "ETH/USDT"]);
    expect(command.scenarioSequence).toEqual(["target"]);
    expect(command.cycleCount).toBe("1");
    expect(command.riskBudgetUsd).toBe("25");
    expect(command.phaseDelaySecs).toBe("2.5");
  });

  it("clamps multi-cycle runs to the paper-loop safety limit", () => {
    const command = buildKrakenSpotRunCommand(
      {
        scenario: "stop",
        scenarioSequence: ["stop", "target", "not-real"] as never,
        cycleCount: "99",
        varDir: "/tmp/kraken-autonomy",
      },
      "/workspace/nautilus_trader/polymarket/dashboard/web",
    );

    expect(command.scenarioSequence).toEqual(["stop", "target"]);
    expect(command.cycleCount).toBe("8");
    expect(command.args).toContain("--cycle-count");
    expect(command.args).toContain("8");
  });

  it("can launch the scenario recommended by the latest session runbook", () => {
    const varDir = mkdtempSync(join(tmpdir(), "kraken-runner-recommended-"));
    writeFileSync(
      join(varDir, "session_runbook.json"),
      `${JSON.stringify({
        event_type: "kraken_spot.session_runbook.v1",
        session_id: "session-test",
        next_cycle_scenario: "no-entry",
      })}\n`,
    );

    const command = buildKrakenSpotRunCommand(
      {
        scenario: "recommended",
        varDir,
      },
      "/workspace/nautilus_trader/polymarket/dashboard/web",
    );

    expect(command.scenario).toBe("no-entry");
    expect(command.scenarioSequence).toEqual(["no-entry"]);
    expect(command.recommendationSource).toBe("session_runbook");
    expect(command.args).toContain("--scenario");
    expect(command.args).toContain("no-entry");
  });
});
