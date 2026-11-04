import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { one } from "@/lib/db";
import { clientIp, enforceRateLimit, HttpError, publicRoute } from "@/lib/http";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
// Compared against when the email is unknown, so timing does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const POST = publicRoute(async ({ req }) => {
  const { email, password } = schema.parse(await req.json());
  await enforceRateLimit(`login:${clientIp(req)}`, 10, 900);
  const admin = await one<{ email: string; password_hash: string }>(
    `SELECT email, password_hash FROM admins WHERE lower(email) = lower($1)`,
    [email],
  );
  const valid = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !valid) throw new HttpError(401, "Incorrect email or password.");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(admin.email), sessionCookieOptions);
  return response;
});
