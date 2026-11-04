import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertActive,
  firstName,
  forgetDevice,
  limitCheckin,
  linkDevice,
  personFromDevice,
  todaysProgramSession,
  withDeviceCookie,
} from "@/lib/checkin";
import { one, withTx } from "@/lib/db";
import { HttpError, notFound, publicRoute } from "@/lib/http";
import { recordAttendance, registerSelf } from "@/lib/services";

const programByToken = (token: string) =>
  one<{ id: string; name: string }>(`SELECT id, name FROM programs WHERE qr_token = $1 AND archived_at IS NULL`, [token]);

const registration = z.object({
  full_name: z.string().trim().min(1, "Please enter your name").max(200),
  phone: z.string().trim().min(5, "Please enter your phone number").max(40),
  email: z.string().trim().email().max(200).or(z.literal("")).nullish(),
});

export const GET = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "read");
  const program = await programByToken(params.token);
  if (!program) throw notFound("Program");
  const session = await todaysProgramSession(program.id);
  const person = await personFromDevice(req);
  const already =
    person && session
      ? await one(`SELECT 1 AS x FROM attendance WHERE session_id = $1 AND person_id = $2 AND present`, [session.id, person.id])
      : null;
  return {
    program: { name: program.name },
    session: session ? { date: session.date } : null,
    person: person ? { first_name: firstName(person.full_name) } : null,
    already_checked_in: Boolean(already),
  };
});

// The session is resolved on the server: this endpoint can only ever write to today's
// session of the program named by the QR token. Altar call is never accepted here.
export const POST = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "write");
  const program = await programByToken(params.token);
  if (!program) throw notFound("Program");
  const session = await todaysProgramSession(program.id);
  if (!session) throw new HttpError(409, "There is no service open for check-in today.");

  const known = await personFromDevice(req);
  if (known) assertActive(known);
  const input = known ? null : registration.parse(await req.json());

  const { name, token } = await withTx("public:qr", async (tx) => {
    const personId = known?.id ?? (await registerSelf(tx, { ...input!, source: "qr" }));
    await recordAttendance(tx, { sessionId: session.id, personId, present: true, method: "qr", recordedBy: "self" });
    return {
      name: firstName(known?.full_name ?? input!.full_name),
      token: await linkDevice(tx, req, personId),
    };
  });
  return withDeviceCookie(NextResponse.json({ ok: true, first_name: name, program: program.name }), token);
});

/** "Not you?" on a shared phone: this device forgets the person. */
export const DELETE = publicRoute(async () => forgetDevice(NextResponse.json({ ok: true })));
