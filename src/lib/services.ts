import { randomBytes } from "node:crypto";
import { today } from "./config";
import { Tx, txOne, txRows } from "./db";
import { isSundayDate, normalizeName, normalizePhone } from "./engine";
import { HttpError, notFound } from "./http";
import {
  applyDepartmentState,
  applyTag,
  ensureAltarFollowUp,
  ensurePendingReviews,
  recomputePeople,
  removeTag,
  TAG_ALTAR_CALL,
  TAG_ENROLLED,
  writeMissStreak,
} from "./recompute";

export const newQrToken = () => randomBytes(18).toString("base64url");

// ---------------------------------------------------------------- people

export interface PersonInput {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  address?: string | null;
  source?: string | null;
}

export async function createPerson(tx: Tx, input: PersonInput): Promise<{ id: string; full_name: string }> {
  const person = await txOne<{ id: string; full_name: string }>(
    tx,
    `INSERT INTO people (full_name, phone, email, gender, address, source)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name`,
    [
      input.full_name.trim(),
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.gender || null,
      input.address?.trim() || null,
      input.source ?? "admin",
    ],
  );
  return person!;
}

/**
 * Self-registration with duplicate detection. Same phone and same name is the same
 * person, so no duplicate is created. Same phone or same name alone may be a relative
 * or a namesake, so a new person is created and flagged for the admin to review.
 */
export async function registerSelf(tx: Tx, input: PersonInput): Promise<string> {
  const phone = normalizePhone(input.phone);
  const name = normalizeName(input.full_name);
  const matches = await txRows<{ id: string; status: string; samePhone: boolean; sameName: boolean }>(
    tx,
    `SELECT id, status,
            ($1 <> '' AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $1) AS "samePhone",
            (regexp_replace(lower(btrim(full_name)), '\\s+', ' ', 'g') = $2) AS "sameName"
       FROM people
      WHERE ($1 <> '' AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $1)
         OR regexp_replace(lower(btrim(full_name)), '\\s+', ' ', 'g') = $2
      ORDER BY created_at`,
    [phone, name],
  );
  const exact = matches.find((m) => m.samePhone && m.sameName && m.status === "active");
  if (exact) return exact.id;

  const person = await createPerson(tx, { ...input, source: input.source ?? "qr" });
  for (const m of matches.slice(0, 5)) {
    await tx.query(
      `INSERT INTO possible_duplicates (person_id, matched_person_id, matched_on) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [person.id, m.id, m.samePhone ? "phone" : "name"],
    );
  }
  return person.id;
}

// ---------------------------------------------------------------- attendance

interface SessionInfo {
  id: string;
  date: string;
  program_id: string;
}

async function openSession(tx: Tx, sessionId: string): Promise<SessionInfo> {
  const session = await txOne<SessionInfo>(
    tx,
    `SELECT s.id, s.date, s.program_id FROM sessions s
      WHERE s.id = $1 AND s.archived_at IS NULL`,
    [sessionId],
  );
  if (!session) throw notFound("Session");
  if (session.date > today()) throw new HttpError(400, "Attendance cannot be recorded for a future session.");
  return session;
}

export interface AttendanceInput {
  sessionId: string;
  personId: string;
  present: boolean;
  altarCall?: boolean;
  method: "admin" | "qr";
  recordedBy: string;
}

/** Writes one mark, applies altar-call effects, then refreshes this person's streaks. */
export async function recordAttendance(tx: Tx, input: AttendanceInput) {
  const session = await openSession(tx, input.sessionId);
  const person = await txOne<{ status: string }>(tx, `SELECT status FROM people WHERE id = $1`, [input.personId]);
  if (!person) throw notFound("Person");
  if (person.status !== "active") throw new HttpError(409, "This person is archived. Restore them first.");

  // A QR scan or a later visit leaves altar_call untouched, since only the admin sets it.
  const altar = input.present ? (input.altarCall ?? null) : false;
  const row = await txOne<{ id: string; altar_call: boolean; present: boolean }>(
    tx,
    `INSERT INTO attendance (session_id, person_id, present, altar_call, recorded_by, method)
     VALUES ($1, $2, $3, coalesce($4::boolean, false), $5, $6)
     ON CONFLICT (session_id, person_id) DO UPDATE
       SET present = EXCLUDED.present,
           altar_call = coalesce($4::boolean, attendance.altar_call),
           recorded_by = EXCLUDED.recorded_by,
           method = EXCLUDED.method,
           recorded_at = now()
     RETURNING id, altar_call, present`,
    [input.sessionId, input.personId, input.present, altar, input.recordedBy, input.method],
  );

  if (input.present) {
    await tx.query(
      `UPDATE people SET first_visit_date = $2
        WHERE id = $1 AND (first_visit_date IS NULL OR first_visit_date > $2)`,
      [input.personId, session.date],
    );
  }
  if (row!.altar_call) await applyTag(tx, input.personId, TAG_ALTAR_CALL);
  else if (altar === false) await reconcileAltarTag(tx, input.personId);

  await recomputePeople(tx, [input.personId]);
  return row!;
}

/** Keeps the tag accurate: it stays only while an altar-call mark exists. */
async function reconcileAltarTag(tx: Tx, personId: string) {
  const remaining = await txOne(tx, `SELECT 1 AS x FROM attendance WHERE person_id = $1 AND altar_call`, [personId]);
  if (!remaining) await removeTag(tx, personId, TAG_ALTAR_CALL);
}

export async function setAltarCall(tx: Tx, attendanceId: string, altarCall: boolean) {
  const row = await txOne<{ person_id: string; present: boolean }>(
    tx,
    `SELECT person_id, present FROM attendance WHERE id = $1`,
    [attendanceId],
  );
  if (!row) throw notFound("Attendance record");
  if (altarCall && !row.present) throw new HttpError(400, "Only someone marked present can be marked for altar call.");
  await tx.query(`UPDATE attendance SET altar_call = $2 WHERE id = $1`, [attendanceId, altarCall]);
  if (altarCall) await applyTag(tx, row.person_id, TAG_ALTAR_CALL);
  else await reconcileAltarTag(tx, row.person_id);
}

/**
 * The church's attendance for one service: three numbers typed in by the admin.
 * Saving again corrects the numbers, so a service only ever has one set.
 */
export async function saveHeadcount(
  tx: Tx,
  input: { sessionId: string; male: number; female: number; children: number; recordedBy: string },
) {
  await openSession(tx, input.sessionId);
  const row = await txOne<{ male: number; female: number; children: number }>(
    tx,
    `INSERT INTO service_headcounts (session_id, male, female, children, recorded_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id) DO UPDATE
       SET male = EXCLUDED.male, female = EXCLUDED.female, children = EXCLUDED.children,
           recorded_by = EXCLUDED.recorded_by, recorded_at = now()
     RETURNING male, female, children`,
    [input.sessionId, input.male, input.female, input.children, input.recordedBy],
  );
  return { ...row!, total: row!.male + row!.female + row!.children };
}

/**
 * Someone who came out at altar call, typed in by the admin. Links to the existing person
 * when name and phone both match, then starts the usual monitoring: the Altar Call tag and
 * a high-priority follow-up. They are already inside the service's headcount, so it is unchanged.
 */
export async function addAltarCall(tx: Tx, sessionId: string, input: PersonInput, recordedBy: string) {
  const personId = await registerSelf(tx, { ...input, source: "altar_call" });
  await recordAttendance(tx, { sessionId, personId, present: true, altarCall: true, method: "admin", recordedBy });
  return { id: personId };
}

// ---------------------------------------------------------------- programs and sessions

export async function createSession(tx: Tx, programId: string, date: string, notes?: string | null) {
  const program = await txOne<{ is_sunday: boolean; archived_at: Date | null }>(
    tx,
    `SELECT is_sunday, archived_at FROM programs WHERE id = $1`,
    [programId],
  );
  if (!program) throw notFound("Program");
  if (program.archived_at) throw new HttpError(409, "This program is archived.");
  // Only real Sundays may feed Academy eligibility.
  if (program.is_sunday && !isSundayDate(date)) {
    throw new HttpError(400, "This is a Sunday program, so its sessions must fall on a Sunday.");
  }
  const existing = await txOne(
    tx,
    `SELECT 1 AS x FROM sessions WHERE program_id = $1 AND date = $2 AND archived_at IS NULL`,
    [programId, date],
  );
  if (existing) throw new HttpError(409, "This program already has a session on that date.");
  const session = await txOne<{ id: string; date: string }>(
    tx,
    `INSERT INTO sessions (program_id, date, notes) VALUES ($1, $2, $3) RETURNING id, date`,
    [programId, date, notes || null],
  );
  await ensurePendingReviews(tx);
  return session!;
}

// ---------------------------------------------------------------- departments

/** Section 5.3 state machine entry point for one department mark. */
export async function recordDepartmentAttendance(
  tx: Tx,
  input: { sessionId: string; personId: string; departmentId: string; present: boolean; method: "qr" | "admin" },
) {
  await openSession(tx, input.sessionId);
  const membership = await txOne<{ status: string }>(
    tx,
    `SELECT status FROM department_memberships
      WHERE person_id = $1 AND department_id = $2 AND removed_at IS NULL`,
    [input.personId, input.departmentId],
  );
  if (!membership) throw new HttpError(409, "This person is not a current member of the department.");
  await tx.query(
    `INSERT INTO department_attendance (session_id, person_id, department_id, present, method)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (session_id, person_id, department_id) DO UPDATE
       SET present = EXCLUDED.present, method = EXCLUDED.method, recorded_at = now()`,
    [input.sessionId, input.personId, input.departmentId, input.present, input.method],
  );
  return applyDepartmentState(tx, input.personId, input.departmentId);
}

/** Admin only. Puts a person in a department, or moves them from their current one. */
export async function assignDepartment(tx: Tx, personId: string, departmentId: string) {
  const department = await txOne(tx, `SELECT 1 AS x FROM departments WHERE id = $1 AND archived_at IS NULL`, [departmentId]);
  if (!department) throw notFound("Department");
  const person = await txOne<{ status: string }>(tx, `SELECT status FROM people WHERE id = $1`, [personId]);
  if (!person) throw notFound("Person");

  const barred = await txOne(
    tx,
    `SELECT 1 AS x FROM department_memberships
      WHERE person_id = $1 AND department_id = $2 AND status = 'permanently_removed'`,
    [personId, departmentId],
  );
  if (barred) throw new HttpError(409, "This person was permanently removed from that department. That cannot be undone.");

  const current = await txOne<{ id: string; department_id: string; status: string }>(
    tx,
    `SELECT id, department_id, status FROM department_memberships WHERE person_id = $1 AND removed_at IS NULL`,
    [personId],
  );
  if (current?.department_id === departmentId) return;
  if (current?.status === "waiting_corner") {
    throw new HttpError(409, "This person is in the Waiting Corner. Restore or permanently remove them first.");
  }
  if (current) await tx.query(`UPDATE department_memberships SET removed_at = now() WHERE id = $1`, [current.id]);
  await tx.query(`INSERT INTO department_memberships (person_id, department_id) VALUES ($1, $2)`, [personId, departmentId]);
}

export async function restoreMember(tx: Tx, departmentId: string, personId: string, note?: string | null) {
  const updated = await txOne(
    tx,
    `UPDATE department_memberships SET status = 'active'
      WHERE person_id = $1 AND department_id = $2 AND status = 'waiting_corner' AND removed_at IS NULL
      RETURNING id`,
    [personId, departmentId],
  );
  if (!updated) throw new HttpError(409, "Only someone in the Waiting Corner can be restored.");
  await writeMissStreak(tx, personId, departmentId, 0);
  await tx.query(
    `INSERT INTO department_events (person_id, department_id, event_type, miss_count_at_event, note)
     VALUES ($1, $2, 'restored', 0, $3)`,
    [personId, departmentId, note || null],
  );
}

export async function permanentlyRemoveMember(tx: Tx, departmentId: string, personId: string, note?: string | null) {
  const stat = await txOne<{ miss_streak: number }>(
    tx,
    `SELECT miss_streak FROM person_department_stats WHERE person_id = $1 AND department_id = $2`,
    [personId, departmentId],
  );
  const updated = await txOne(
    tx,
    `UPDATE department_memberships SET status = 'permanently_removed', removed_at = now()
      WHERE person_id = $1 AND department_id = $2 AND status = 'waiting_corner' AND removed_at IS NULL
      RETURNING id`,
    [personId, departmentId],
  );
  if (!updated) throw new HttpError(409, "Permanent removal is only allowed from the Waiting Corner.");
  await tx.query(
    `INSERT INTO department_events (person_id, department_id, event_type, miss_count_at_event, note)
     VALUES ($1, $2, 'permanently_removed', $3, $4)`,
    [personId, departmentId, stat?.miss_streak ?? 0, note || null],
  );
}

// ---------------------------------------------------------------- academy

export async function enroll(tx: Tx, personId: string, note?: string | null) {
  const ready = await txOne(
    tx,
    `SELECT 1 AS x FROM person_academy_stats WHERE person_id = $1 AND ready_since IS NOT NULL`,
    [personId],
  );
  if (!ready) throw new HttpError(409, "This person has not reached 4 consecutive Sundays.");
  const enrolled = await txOne(tx, `SELECT 1 AS x FROM enrollments WHERE person_id = $1`, [personId]);
  if (enrolled) throw new HttpError(409, "This person is already enrolled.");
  await tx.query(`INSERT INTO enrollments (person_id, note) VALUES ($1, $2)`, [personId, note || null]);
  await applyTag(tx, personId, TAG_ENROLLED);
}

// ---------------------------------------------------------------- reviews

export const requiredMembersSql = `
  SELECT DISTINCT p.id, p.full_name, m.status
    FROM department_memberships m
    JOIN people p ON p.id = m.person_id AND p.status = 'active'
   WHERE m.department_id = $1
     AND (m.joined_at AT TIME ZONE $3)::date <= $2::date
     AND (m.removed_at IS NULL OR (m.removed_at AT TIME ZONE $3)::date >= $2::date)
   ORDER BY p.full_name`;

export interface ReviewInput {
  department_id: string;
  session_id: string;
  summary: string;
  challenges?: string | null;
  highlights?: string | null;
  notes: { person_id: string; note: string }[];
}

/** Locked decision: a review cannot be submitted without a note for every member. */
export async function submitReview(tx: Tx, input: ReviewInput) {
  const session = await txOne<{ date: string }>(
    tx,
    `SELECT date FROM sessions WHERE id = $1 AND archived_at IS NULL`,
    [input.session_id],
  );
  if (!session) throw notFound("Session");
  if (session.date > today()) throw new HttpError(400, "A review can only be submitted once the service has happened.");
  const department = await txOne(tx, `SELECT 1 AS x FROM departments WHERE id = $1`, [input.department_id]);
  if (!department) throw notFound("Department");

  const required = await txRows<{ id: string; full_name: string }>(tx, requiredMembersSql, [
    input.department_id,
    session.date,
    process.env.CHURCH_TIMEZONE || "UTC",
  ]);
  const notes = new Map(input.notes.map((n) => [n.person_id, n.note.trim()]));
  const missing = required.filter((m) => !notes.get(m.id));
  if (missing.length) {
    throw new HttpError(400, `A note is required for every member. Missing: ${missing.map((m) => m.full_name).join(", ")}`, {
      missing: missing.map((m) => m.id),
    });
  }

  const review = await txOne<{ id: string }>(
    tx,
    `INSERT INTO service_reviews (department_id, session_id, summary, challenges, highlights, submitted_at, status)
     VALUES ($1, $2, $3, $4, $5, now(), 'submitted')
     ON CONFLICT (department_id, session_id) DO UPDATE
       SET summary = EXCLUDED.summary, challenges = EXCLUDED.challenges, highlights = EXCLUDED.highlights,
           submitted_at = now(), status = 'submitted'
     RETURNING id`,
    [input.department_id, input.session_id, input.summary.trim(), input.challenges || null, input.highlights || null],
  );
  for (const m of required) {
    await tx.query(
      `INSERT INTO member_notes (review_id, person_id, note) VALUES ($1, $2, $3)
       ON CONFLICT (review_id, person_id) DO UPDATE SET note = EXCLUDED.note`,
      [review!.id, m.id, notes.get(m.id)],
    );
  }
  return review!;
}

export { ensureAltarFollowUp };
