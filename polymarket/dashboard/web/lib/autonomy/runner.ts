import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { autonomyArtifactVarDir } from "./artifacts";

export type KrakenRunScenario = "target" | "stop" | "timebox" | "no-entry";
export type KrakenRunScenarioRequest = KrakenRunScenario | "recommended";
export type KrakenRunSource = "simulated" | "kraken-public";

export interface KrakenRunRequest {
  scenario?: KrakenRunScenarioRequest;
  scenarioSequence?: KrakenRunScenario[];
  source?: KrakenRunSource;
  symbols?: string[];
  riskBudgetUsd?: string;
  phaseDelaySecs?: string;
  cycleCount?: string | number;
  varDir?: string;
}

export interface KrakenRunCommand {
  repoRoot: string;
  pythonPath: string;
  scriptPath: string;
  args: string[];
  varDir: string;
  scenario: KrakenRunScenario;
  scenarioSequence: KrakenRunScenario[];
  source: KrakenRunSource;
  symbols: string[];
  riskBudgetUsd: string;
  phaseDelaySecs: string;
  cycleCount: string;
  recommendationSource: "request" | "session_runbook" | "default";
}

export interface KrakenRunnerState {
  status: "running" | "exited";
  pid: number;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  scenario: KrakenRunScenario;
  scenarioSequence: KrakenRunScenario[];
  source: KrakenRunSource;
  symbols: string[];
  cycleCount: string;
  varDir: string;
}

const DEFAULT_SYMBOLS = ["BTC/USDT", "ETH/USDT"];
const DEFAULT_SCENARIO: KrakenRunScenario = "target";
const DEFAULT_SOURCE: KrakenRunSource = "simulated";
const DEFAULT_RISK_BUDGET_USD = "25";
const DEFAULT_PHASE_DELAY_SECS = "2.5";
const DEFAULT_CYCLE_COUNT = "1";
const MAX_CYCLE_COUNT = 8;

function runnerStatePath(varDir: string) {
  return join(varDir, "runner_state.json");
}

function sessionRunbookPath(varDir: string) {
  return join(varDir, "session_runbook.json");
}

function repoRootFromWebCwd(cwd: string) {
  return resolve(cwd, "../../..");
}

function isScenario(value: unknown): value is KrakenRunScenario {
  return (
    value === "target" ||
    value === "stop" ||
    value === "timebox" ||
    value === "no-entry"
  );
}

function isSource(value: unknown): value is KrakenRunSource {
  return value === "simulated" || value === "kraken-public";
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

function normalizeSymbols(symbols: unknown): string[] {
  if (!Array.isArray(symbols)) {
    return DEFAULT_SYMBOLS;
  }

  const normalized = symbols
    .filter((symbol): symbol is string => typeof symbol === "string")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : DEFAULT_SYMBOLS;
}

function normalizeScenarioSequence(
  sequence: unknown,
  fallback: KrakenRunScenario,
): KrakenRunScenario[] {
  if (!Array.isArray(sequence)) {
    return [fallback];
  }

  const normalized = sequence.filter(isScenario);
  return normalized.length > 0 ? normalized : [fallback];
}

function normalizeCycleCount(value: unknown): string {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CYCLE_COUNT;
  }

  return String(Math.max(1, Math.min(MAX_CYCLE_COUNT, Math.trunc(parsed))));
}

function pidIsRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    );
  }
}

function readStateFile(path: string): KrakenRunnerState | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "status" in parsed &&
      "pid" in parsed &&
      (parsed.status === "running" || parsed.status === "exited") &&
      typeof parsed.pid === "number"
    ) {
      return parsed as KrakenRunnerState;
    }
  } catch {
    return null;
  }

  return null;
}

function recommendedScenarioFromRunbook(varDir: string): KrakenRunScenario | null {
  const path = sessionRunbookPath(varDir);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "next_cycle_scenario" in parsed &&
      isScenario(parsed.next_cycle_scenario)
    ) {
      return parsed.next_cycle_scenario;
    }
  } catch {
    return null;
  }

  return null;
}

function writeStateFile(path: string, state: KrakenRunnerState) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function buildKrakenSpotRunCommand(
  request: KrakenRunRequest = {},
  cwd = process.cwd(),
): KrakenRunCommand {
  const repoRoot = repoRootFromWebCwd(cwd);
  const varDir = request.varDir ?? autonomyArtifactVarDir();
  const recommendedScenario =
    request.scenario === "recommended"
      ? recommendedScenarioFromRunbook(varDir)
      : null;
  const scenario = recommendedScenario
    ? recommendedScenario
    : isScenario(request.scenario)
      ? request.scenario
      : DEFAULT_SCENARIO;
  const recommendationSource = recommendedScenario
    ? "session_runbook"
    : isScenario(request.scenario)
      ? "request"
      : "default";
  const scenarioSequence = normalizeScenarioSequence(
    request.scenarioSequence,
    scenario,
  );
  const source = isSource(request.source) ? request.source : DEFAULT_SOURCE;
  const symbols = normalizeSymbols(request.symbols);
  const riskBudgetUsd = stringOrDefault(
    request.riskBudgetUsd,
    DEFAULT_RISK_BUDGET_USD,
  );
  const phaseDelaySecs = stringOrDefault(
    request.phaseDelaySecs,
    DEFAULT_PHASE_DELAY_SECS,
  );
  const cycleCount = normalizeCycleCount(request.cycleCount);
  const pythonPath = join(repoRoot, ".venv/bin/python");
  const scriptPath = join(
    repoRoot,
    "examples/live/kraken/kraken_spot_autonomy_bot.py",
  );
  const symbolArgs = symbols.flatMap((symbol) => ["--symbol", symbol]);

  return {
    repoRoot,
    pythonPath,
    scriptPath,
    varDir,
    scenario,
    scenarioSequence,
    source,
    symbols,
    riskBudgetUsd,
    phaseDelaySecs,
    cycleCount,
    recommendationSource,
    args: [
      scriptPath,
      "--source",
      source,
      "--scenario",
      scenario,
      "--scenario-sequence",
      scenarioSequence.join(","),
      "--cycle-count",
      cycleCount,
      ...symbolArgs,
      "--risk-budget-usd",
      riskBudgetUsd,
      "--phase-delay-secs",
      phaseDelaySecs,
      "--var-dir",
      varDir,
    ],
  };
}

export function readKrakenRunnerState(
  varDir = autonomyArtifactVarDir(),
): KrakenRunnerState | null {
  const path = runnerStatePath(varDir);
  const state = readStateFile(path);

  if (state?.status === "running" && !pidIsRunning(state.pid)) {
    unlinkSync(path);
    return null;
  }

  return state;
}

export function launchKrakenSpotPaperCycle(request: KrakenRunRequest = {}) {
  const command = buildKrakenSpotRunCommand(request);
  mkdirSync(command.varDir, { recursive: true });

  const existing = readKrakenRunnerState(command.varDir);
  if (existing?.status === "running") {
    return {
      status: "already_running" as const,
      runner: existing,
      command,
    };
  }

  const child = spawn(command.pythonPath, command.args, {
    cwd: command.repoRoot,
    env: process.env,
    stdio: "ignore",
  });

  if (typeof child.pid !== "number") {
    throw new Error("Kraken Spot runner did not expose a process id.");
  }

  const path = runnerStatePath(command.varDir);
  const runner: KrakenRunnerState = {
    status: "running",
    pid: child.pid,
    startedAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    signal: null,
    scenario: command.scenario,
    scenarioSequence: command.scenarioSequence,
    source: command.source,
    symbols: command.symbols,
    cycleCount: command.cycleCount,
    varDir: command.varDir,
  };

  writeStateFile(path, runner);

  child.once("exit", (exitCode, signal) => {
    writeStateFile(path, {
      ...runner,
      status: "exited",
      finishedAt: Date.now(),
      exitCode,
      signal,
    });
  });

  return {
    status: "started" as const,
    runner,
    command,
  };
}
