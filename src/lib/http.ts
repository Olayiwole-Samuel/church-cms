import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentAdmin } from "./auth";
import { one } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const toResponse = (error: unknown) => {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", details: error.issues },
      { status: 400 },
    );
  }
  const pgCode = (error as { code?: string })?.code;
  if (pgCode === "23505") return NextResponse.json({ error: "That record already exists." }, { status: 409 });
  if (pgCode === "22P02") return NextResponse.json({ error: "Not found." }, { status: 404 });
  console.error(error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
};

type Ctx<P> = { req: NextRequest; params: P };
type RouteContext<P> = { params: Promise<P> };

/** A public route handler with uniform error handling. */
export function publicRoute<P = Record<string, string>>(fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, context: RouteContext<P>) => {
    try {
      const result = await fn({ req, params: await context.params });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** An admin-only route handler. `actor` is the signed-in admin, for the audit log. */
export function adminRoute<P = Record<string, string>>(fn: (ctx: Ctx<P> & { actor: string }) => Promise<unknown>) {
  return async (req: NextRequest, context: RouteContext<P>) => {
    try {
      const actor = await currentAdmin();
      if (!actor) throw new HttpError(401, "Please sign in.");
      const result = await fn({ req, params: await context.params, actor });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return toResponse(error);
    }
  };
}

export const notFound = (what = "Record") => new HttpError(404, `${what} not found.`);

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

/**
 * Fixed-window limiter stored in Postgres, so it holds across serverless instances.
 * The limit is deliberately generous: a whole congregation can share one church Wi-Fi IP.
 */
export async function enforceRateLimit(key: string, limit: number, windowSeconds = 60): Promise<void> {
  // Runs outside the caller's transaction so a rejected attempt still counts.
  const row = await one<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [key, windowSeconds],
  );
  if ((row?.count ?? 0) > limit) throw new HttpError(429, "Too many attempts. Please wait a moment and try again.");
}
