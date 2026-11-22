import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertActive,
  checkinSource,
  firstName,
  forgetDevice,
  limitCheckin,
  linkDevice,
  personFromDevice,
  todaysSessions,
  withDeviceCookie,
} from "@/lib/checkin";
import { churchName } from "@/lib/config";
import { query, withTx } from "@/lib/db";
import { pickCheckinSession } from "@/lib/engine";
import { HttpError, notFound, publicRoute } from "@/lib/http";
import { recordAttendance, registerSelf } from "@/lib/services";

const schema = z.object({
  session_id: z.string().uuid().nullish(),
  full_name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).or(z.literal("")).nullish(),
});

export const GET = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "read");
  const source = await checkinSource(params.token);
  if (!source) throw notFound("Check-in code");
  const sessions = await todaysSessions();
  const person = await personFromDevice(req);
  const checked = person
    ? await query<{ session_id: string }>(
        `SELECT session_id FROM attendance WHERE person_id = $1 AND present AND session_id = ANY($2::uuid[])`,
        [person.id, sessions.map((s) => s.id)],
      )
    : [];
  const pick = pickCheckinSession(sessions, { preferredProgramId: source.programId });
  return {
    church: churchName(),
    sessions: sessions.map((s) => ({ id: s.id, program_name: s.program_name, checked_in: checked.some((c) => c.session_id === s.id) })),
    auto_session_id: pick && pick !== "choose" ? pick.id : null,
    person: person ? { first_name: firstName(person.full_name) } : null,
  };
});

// Writes only to a service held today. Altar call is never accepted here.
export const POST = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "write");
  const source = await checkinSource(params.token);
  if (!source) throw notFound("Check-in code");
  const input = schema.parse(await req.json());

  const sessions = await todaysSessions();
  if (sessions.length === 0) throw new HttpError(409, "There is no service open for check-in today.");
  const session = pickCheckinSession(sessions, { preferredProgramId: source.programId, chosenId: input.session_id });
  if (session === "choose") throw new HttpError(400, "Please choose which service you are attending.");
  if (!session) throw new HttpError(400, "That service is not open for check-in today.");

  const known = await personFromDevice(req);
  if (known) assertActive(known);
  if (!known) {
    if (!input.full_name) throw new HttpError(400, "Please enter your name.");
    if (!input.phone || input.phone.length < 5) throw new HttpError(400, "Please enter your phone number.");
  }

  const result = await withTx("public:qr", async (tx) => {
    const personId =
      known?.id ?? (await registerSelf(tx, { full_name: input.full_name!, phone: input.phone, email: input.email, source: "qr" }));
    await recordAttendance(tx, { sessionId: session.id, personId, present: true, method: "qr", recordedBy: "self" });
    return { token: await linkDevice(tx, req, personId), name: firstName(known?.full_name ?? input.full_name!) };
  });
  return withDeviceCookie(NextResponse.json({ ok: true, first_name: result.name, program: session.program_name }), result.token);
});

/** "Not you?" on a shared phone: this device forgets the person. */
export const DELETE = publicRoute(async () => forgetDevice(NextResponse.json({ ok: true })));
