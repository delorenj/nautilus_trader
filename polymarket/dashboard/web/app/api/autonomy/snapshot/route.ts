import { NextResponse } from "next/server";

import { buildAutonomySnapshot } from "@/lib/autonomy/artifacts";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildAutonomySnapshot());
}
