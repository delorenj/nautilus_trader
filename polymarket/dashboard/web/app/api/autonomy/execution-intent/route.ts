import { NextResponse } from "next/server";

import { buildAutonomySnapshot } from "@/lib/autonomy/artifacts";
import { buildExecutionIntentSnapshot } from "@/lib/autonomy/execution-intent";
import { buildExecutionReadinessSnapshot } from "@/lib/autonomy/live-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const autonomy = buildAutonomySnapshot();
  const readiness = buildExecutionReadinessSnapshot(process.env, autonomy);

  return NextResponse.json(buildExecutionIntentSnapshot(autonomy, readiness));
}
