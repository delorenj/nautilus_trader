import { NextResponse } from "next/server";

import { buildAutonomySnapshot } from "@/lib/autonomy/artifacts";
import { buildExecutionReadinessSnapshot } from "@/lib/autonomy/live-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    buildExecutionReadinessSnapshot(process.env, buildAutonomySnapshot()),
  );
}
