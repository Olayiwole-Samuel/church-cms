import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertActive,
  departmentState,
  firstName,
  forgetDevice,
  limitCheckin,
  linkDevice,
  personFromDevice,
  todaysSessions,
  withDeviceCookie,
} from "@/lib/checkin";
import { one, query, txOne, withTx } from "@/lib/db";
import { HttpError, notFound, publicRoute } from "@/lib/http";
import { recordDepartmentAttendance, registerSelf } from "@/lib/services";

const departmentByToken = (token: string) =>
  one<{ id: string; name: string }>(`SELECT id, name FROM departments WHERE qr_token = $1 AND archived_at IS NULL`, [token]);

const schema = z.object({
  department_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  full_name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).or(z.literal("")).nullish(),
});

export const GET = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "read");
  const department = await departmentByToken(params.token);
  if (!department) throw notFound("Department");
  const sessions = await todaysSessions();
  const person = await personFromDevice(req);
  const state = person
    ? await withTx("public:qr", (tx) => departmentState(tx, person.id))
    : { current: null, permanentlyRemoved: false };
  const checked =
    person && state.current
      ? await query<{ session_id: string }>(
          `SELECT session_id FROM department_attendance
            WHERE person_id = $1 AND department_id = $2 AND present AND session_id = ANY($3::uuid[])`,
          [person.id, state.current.department_id, sessions.map((s) => s.id)],
        )
      : [];
  return {
    department: { id: department.id, name: department.name },
    departments: await query(`SELECT id, name FROM departments WHERE archived_at IS NULL ORDER BY name`),
    sessions: sessions.map((s) => ({
      id: s.id,
      program_name: s.program_name,
      checked_in: checked.some((c) => c.session_id === s.id),
    })),
    person: person ? { first_name: firstName(person.full_name) } : null,
    locked_department: state.current ? { id: state.current.department_id, name: state.current.name } : null,
    barred: !state.current && state.permanentlyRemoved,
  };
});

// A person's first pick locks them to that department. Afterwards any department's QR
// records against their locked department, and only the admin can change it.
export const POST = publicRoute<{ token: string }>(async ({ req, params }) => {
  await limitCheckin(req, "write");
  const scanned = await departmentByToken(params.token);
  if (!scanned) throw notFound("Department");
  const input = schema.parse(await req.json());

  const sessions = await todaysSessions();
  if (sessions.length === 0) throw new HttpError(409, "There is no service open for check-in today.");
  const session = sessions.length === 1 ? sessions[0] : sessions.find((s) => s.id === input.session_id);
  if (!session) throw new HttpError(400, "Please choose which service you are serving at.");

  const known = await personFromDevice(req);
  if (known) assertActive(known);
  if (!known) {
    if (!input.full_name) throw new HttpError(400, "Please enter your name.");
    if (!input.phone || input.phone.length < 5) throw new HttpError(400, "Please enter your phone number.");
  }

  const result = await withTx("public:qr", async (tx) => {
    const personId =
      known?.id ?? (await registerSelf(tx, { full_name: input.full_name!, phone: input.phone, email: input.email, source: "qr" }));
    const state = await departmentState(tx, personId);
    if (!state.current && state.permanentlyRemoved) {
      throw new HttpError(403, "Please see the church admin about your department.");
    }
    let departmentId = state.current?.department_id;
    let departmentName = state.current?.name;
    if (!departmentId) {
      const pick = await txOne<{ id: string; name: string }>(
        tx,
        `SELECT id, name FROM departments WHERE id = $1 AND archived_at IS NULL`,
        [input.department_id ?? scanned.id],
      );
      if (!pick) throw notFound("Department");
      await tx.query(`INSERT INTO department_memberships (person_id, department_id) VALUES ($1, $2)`, [personId, pick.id]);
      departmentId = pick.id;
      departmentName = pick.name;
    }
    await recordDepartmentAttendance(tx, { sessionId: session.id, personId, departmentId, present: true, method: "qr" });
    return {
      token: await linkDevice(tx, req, personId),
      firstName: firstName(known?.full_name ?? input.full_name!),
      departmentName,
      waiting: state.current?.status === "waiting_corner",
    };
  });

  return withDeviceCookie(
    NextResponse.json({
      ok: true,
      first_name: result.firstName,
      department: result.departmentName,
      program: session.program_name,
      waiting_corner: result.waiting,
    }),
    result.token,
  );
});

/** "Not you?" on a shared phone: this device forgets the person. */
export const DELETE = publicRoute(async () => forgetDevice(NextResponse.json({ ok: true })));
