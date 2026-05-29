import { NextResponse } from "next/server";

import { buildAutonomySnapshot } from "@/lib/autonomy/artifacts";
import { buildExecutionIntentSnapshot } from "@/lib/autonomy/execution-intent";
import { buildExecutionReadinessSnapshot } from "@/lib/autonomy/live-readiness";
import {
  readExecutionSubmitState,
  recordExecutionAttempt,
  type ExecutionSubmitRequest,
} from "@/lib/autonomy/execution-submit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requestBody(request: Request): Promise<ExecutionSubmitRequest> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ExecutionSubmitRequest)
      : {};
  } catch {
    return {};
  }
}

export function GET() {
  return NextResponse.json(readExecutionSubmitState());
}

export async function POST(request: Request) {
  const autonomy = buildAutonomySnapshot();
  const readiness = buildExecutionReadinessSnapshot(process.env, autonomy);
  const intent = buildExecutionIntentSnapshot(autonomy, readiness);
  const result = recordExecutionAttempt({
    request: await requestBody(request),
    intent,
    readiness,
    env: process.env,
  });

  return NextResponse.json(result, {
    status: result.ok ? 201 : 202,
  });
}
