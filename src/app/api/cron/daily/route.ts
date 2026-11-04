import { NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { HttpError, publicRoute } from "@/lib/http";
import { runDaily } from "@/lib/recompute";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const GET = publicRoute(async ({ req }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized.");
  return NextResponse.json(await withTx("system:daily", (tx) => runDaily(tx)));
});
