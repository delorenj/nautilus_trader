import { NextResponse } from "next/server";

import { buildAutonomySnapshot } from "@/lib/autonomy/artifacts";
import { readExecutionSubmitState } from "@/lib/autonomy/execution-submit";
import { buildOperatorFlowSnapshot } from "@/lib/autonomy/operator-flow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const autonomy = buildAutonomySnapshot();
  return NextResponse.json(
    buildOperatorFlowSnapshot({
      ...autonomy,
      execution: readExecutionSubmitState(),
    }),
  );
}
