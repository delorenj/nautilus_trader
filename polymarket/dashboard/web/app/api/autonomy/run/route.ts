import { NextResponse } from "next/server";

import {
  launchKrakenSpotPaperCycle,
  readKrakenRunnerState,
  type KrakenRunRequest,
} from "@/lib/autonomy/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requestBody(request: Request): Promise<KrakenRunRequest> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as KrakenRunRequest)
      : {};
  } catch {
    return {};
  }
}

export function GET() {
  return NextResponse.json({
    runner: readKrakenRunnerState(),
  });
}

export async function POST(request: Request) {
  const launch = launchKrakenSpotPaperCycle(await requestBody(request));
  const { command, ...response } = launch;

  return NextResponse.json(
    {
      ...response,
      command: {
        source: command.source,
        scenario: command.scenario,
        scenarioSequence: command.scenarioSequence,
        symbols: command.symbols,
        cycleCount: command.cycleCount,
        recommendationSource: command.recommendationSource,
        riskBudgetUsd: command.riskBudgetUsd,
        phaseDelaySecs: command.phaseDelaySecs,
        varDir: command.varDir,
      },
    },
    { status: launch.status === "already_running" ? 202 : 201 },
  );
}
