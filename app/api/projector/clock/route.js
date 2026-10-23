import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public and tiny: projector screens use it to share one clock with the
// dashboard (carousel rotation) and to notice when a new deploy is live.
export async function GET() {
  return NextResponse.json(
    {
      now: Date.now(),
      build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
