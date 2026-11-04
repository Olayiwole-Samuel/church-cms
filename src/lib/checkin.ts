import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkinRateLimit, today } from "./config";
import { one, query, Tx, txOne, txRows } from "./db";
import { clientIp, enforceRateLimit, HttpError } from "./http";

export const DEVICE_COOKIE = "cms_device";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function limitCheckin(req: NextRequest, kind: string) {
  await enforceRateLimit(`checkin:${kind}:${clientIp(req)}`, checkinRateLimit());
}

/** The person this device has been linked to, if any. */
export async function personFromDevice(req: NextRequest) {
  const token = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  return one<{ id: string; full_name: string; status: string }>(
    `SELECT p.id, p.full_name, p.status
       FROM device_tokens d JOIN people p ON p.id = d.person_id
      WHERE d.token_hash = $1`,
    [hashToken(token)],
  );
}

/** Links this device to a person. Returns a new raw token to set as a cookie, if one is needed. */
export async function linkDevice(tx: Tx, req: NextRequest, personId: string): Promise<string | null> {
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  if (existing) {
    const row = await txOne<{ person_id: string }>(
      tx,
      `UPDATE device_tokens SET last_seen_at = now() WHERE token_hash = $1 RETURNING person_id`,
      [hashToken(existing)],
    );
    if (row?.person_id === personId) return null;
  }
  const token = randomBytes(32).toString("base64url");
  await tx.query(`INSERT INTO device_tokens (token_hash, person_id) VALUES ($1, $2)`, [hashToken(token), personId]);
  return token;
}

export function withDeviceCookie(response: NextResponse, token: string | null) {
  if (token) {
    response.cookies.set(DEVICE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export function forgetDevice(response: NextResponse) {
  response.cookies.delete(DEVICE_COOKIE);
  return response;
}

export interface TodaySession {
  id: string;
  date: string;
  program_name: string;
}

/** Today's session for one program: the only session a program QR can write to. */
export async function todaysProgramSession(programId: string) {
  return one<{ id: string; date: string }>(
    `SELECT id, date FROM sessions WHERE program_id = $1 AND date = $2 AND archived_at IS NULL`,
    [programId, today()],
  );
}

/** All services today. Department QR codes are permanent and not tied to one program. */
export async function todaysSessions() {
  return query<TodaySession>(
    `SELECT s.id, s.date, p.name AS program_name
       FROM sessions s JOIN programs p ON p.id = s.program_id AND p.archived_at IS NULL
      WHERE s.date = $1 AND s.archived_at IS NULL
      ORDER BY s.created_at`,
    [today()],
  );
}

export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0];

export function assertActive(person: { status: string }) {
  if (person.status !== "active") throw new HttpError(403, "Please see the church admin to check in.");
}

export async function departmentState(tx: Tx, personId: string) {
  const memberships = await txRows<{ department_id: string; status: string; removed_at: Date | null; name: string }>(
    tx,
    `SELECT m.department_id, m.status, m.removed_at, d.name
       FROM department_memberships m JOIN departments d ON d.id = m.department_id
      WHERE m.person_id = $1`,
    [personId],
  );
  return {
    current: memberships.find((m) => !m.removed_at) ?? null,
    permanentlyRemoved: memberships.some((m) => m.status === "permanently_removed"),
  };
}
