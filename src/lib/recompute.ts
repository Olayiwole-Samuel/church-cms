import { engineConfig, today as churchToday } from "./config";
import { Tx, txOne, txRows } from "./db";
import {
  computeAcademyStats,
  computeMissStreak,
  computeProgramStats,
  daysBetween,
  ProgramStats,
  SessionMark,
  shouldEnterWaitingCorner,
  STATUS,
} from "./engine";

export const TAG_ALTAR_CALL = "Altar Call";
export const TAG_MEMBER = "Member";
export const TAG_ENROLLED = "Discipleship Enrolled";
/** Follow-ups that stay open while someone is away, and close when they return. */
export const CARE_REASONS = ["absence", "drop_off", "first_timer"];

interface SessionRow {
  id: string;
  program_id: string;
  date: string;
  counts_toward_streak: boolean;
  is_sunday: boolean;
}

/**
 * Rebuilds the cached streak, status and academy values for the given people,
 * then raises whatever follow-ups and alerts the new values call for. Attendance
 * is the only input, so running this repeatedly is safe. Batched so a 1,000-person
 * pass stays a handful of queries.
 */
export async function recomputePeople(tx: Tx, personIds: string[], today = churchToday()): Promise<void> {
  if (personIds.length === 0) return;
  const config = engineConfig();

  const sessions = await txRows<SessionRow>(
    tx,
    `SELECT s.id, s.program_id, s.date, p.counts_toward_streak, p.is_sunday
       FROM sessions s JOIN programs p ON p.id = s.program_id
      WHERE s.archived_at IS NULL AND p.archived_at IS NULL AND s.date <= $1
      ORDER BY s.date, s.created_at`,
    [today],
  );

  const attendance = await txRows<{ person_id: string; session_id: string; present: boolean }>(
    tx,
    `SELECT person_id, session_id, present FROM attendance WHERE person_id = ANY($1::uuid[])`,
    [personIds],
  );
  const marksByPerson = new Map<string, Map<string, boolean>>();
  for (const a of attendance) {
    if (!marksByPerson.has(a.person_id)) marksByPerson.set(a.person_id, new Map());
    marksByPerson.get(a.person_id)!.set(a.session_id, a.present);
  }

  const programs = new Map<string, { counts: boolean; sessions: SessionRow[] }>();
  for (const s of sessions) {
    if (!programs.has(s.program_id)) programs.set(s.program_id, { counts: s.counts_toward_streak, sessions: [] });
    programs.get(s.program_id)!.sessions.push(s);
  }
  const countingSessions = sessions.filter((s) => s.counts_toward_streak);
  const sundaySessions = sessions.filter((s) => s.is_sunday);

  const statsRows: (ProgramStats & { personId: string; programId: string | null })[] = [];
  const academyRows: { personId: string; sundayStreak: number; readySince: string | null }[] = [];

  for (const personId of personIds) {
    const marks = marksByPerson.get(personId) ?? new Map<string, boolean>();
    const toMarks = (list: SessionRow[]): SessionMark[] =>
      list.map((s) => ({ date: s.date, present: marks.get(s.id) }));

    for (const [programId, program] of programs) {
      const stats = computeProgramStats(toMarks(program.sessions), program.counts, today, config);
      if (stats) statsRows.push({ ...stats, personId, programId });
    }
    // General streak: every counting program, special programs included, as one sequence.
    const general = computeProgramStats(toMarks(countingSessions), true, today, config);
    if (general) statsRows.push({ ...general, personId, programId: null });

    const academy = computeAcademyStats(toMarks(sundaySessions), today);
    academyRows.push({ personId, ...academy });
  }

  await tx.query(`DELETE FROM person_program_stats WHERE person_id = ANY($1::uuid[])`, [personIds]);
  if (statsRows.length) {
    await tx.query(
      `INSERT INTO person_program_stats
         (person_id, program_id, current_streak, status_badge, total_attended, last_attended, trailing_misses, was_consistent)
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::text[], $5::int[], $6::date[], $7::int[], $8::bool[])`,
      [
        statsRows.map((r) => r.personId),
        statsRows.map((r) => r.programId),
        statsRows.map((r) => r.currentStreak),
        statsRows.map((r) => r.status),
        statsRows.map((r) => r.total),
        statsRows.map((r) => r.lastAttended),
        statsRows.map((r) => r.trailingMisses),
        statsRows.map((r) => r.wasConsistent),
      ],
    );
  }
  await tx.query(`DELETE FROM person_academy_stats WHERE person_id = ANY($1::uuid[])`, [personIds]);
  await tx.query(
    `INSERT INTO person_academy_stats (person_id, sunday_streak, ready_since)
     SELECT * FROM unnest($1::uuid[], $2::int[], $3::date[])`,
    [academyRows.map((r) => r.personId), academyRows.map((r) => r.sundayStreak), academyRows.map((r) => r.readySince)],
  );

  await raiseFollowUpsAndAlerts(tx, personIds, statsRows, today, config.firstTimerFollowUpDays);
}

async function raiseFollowUpsAndAlerts(
  tx: Tx,
  personIds: string[],
  statsRows: (ProgramStats & { personId: string; programId: string | null })[],
  today: string,
  firstTimerDays: number,
) {
  // Only active people get new follow-ups.
  const active = new Set(
    (await txRows<{ id: string }>(tx, `SELECT id FROM people WHERE id = ANY($1::uuid[]) AND status = 'active'`, [personIds])).map(
      (r) => r.id,
    ),
  );

  const existing = await txRows<{ id: string; person_id: string; reason: string; status: string; created_date: string }>(
    tx,
    `SELECT id, person_id, reason, status, (created_at AT TIME ZONE 'UTC')::date AS created_date
       FROM follow_ups WHERE person_id = ANY($1::uuid[])`,
    [personIds],
  );
  const followUpsFor = (personId: string, reason: string) =>
    existing.filter((f) => f.person_id === personId && f.reason === reason);

  const lastAttendedByPerson = new Map<string, string>();
  const programRows = statsRows.filter((r) => r.programId !== null);
  for (const r of programRows) {
    const prev = lastAttendedByPerson.get(r.personId);
    if (r.lastAttended && (!prev || r.lastAttended > prev)) lastAttendedByPerson.set(r.personId, r.lastAttended);
  }

  // One follow-up per episode: nothing new while one is open, or if one was already
  // raised since the person last attended.
  const needsEpisodeFollowUp = (personId: string, reason: string) => {
    const list = followUpsFor(personId, reason);
    if (list.some((f) => f.status === "open")) return false;
    const last = lastAttendedByPerson.get(personId);
    return !list.some((f) => !last || f.created_date >= last);
  };

  const openAlerts = await txRows<{ id: string; person_id: string; program_id: string }>(
    tx,
    `SELECT id, person_id, program_id FROM absence_alerts WHERE person_id = ANY($1::uuid[]) AND NOT resolved`,
    [personIds],
  );
  const hasOpenAlert = (personId: string, programId: string) =>
    openAlerts.some((a) => a.person_id === personId && a.program_id === programId);

  const statByKey = new Map(programRows.map((r) => [`${r.personId}:${r.programId}`, r]));
  const toResolve = openAlerts
    .filter((a) => (statByKey.get(`${a.person_id}:${a.program_id}`)?.trailingMisses ?? 1) === 0)
    .map((a) => a.id);
  if (toResolve.length) {
    await tx.query(`UPDATE absence_alerts SET resolved = true WHERE id = ANY($1::uuid[])`, [toResolve]);
  }

  const absenceDue = new Set<string>();
  const dropOffDue = new Set<string>();
  for (const r of programRows) {
    if (!active.has(r.personId)) continue;
    if (r.absenceTriggered) {
      if (!hasOpenAlert(r.personId, r.programId!)) {
        await tx.query(`INSERT INTO absence_alerts (person_id, program_id) VALUES ($1, $2)`, [r.personId, r.programId]);
      }
      absenceDue.add(r.personId);
    }
    if (r.status === STATUS.droppedOff && needsEpisodeFollowUp(r.personId, "drop_off")) dropOffDue.add(r.personId);
  }

  // First Timer with no return after X days. Looks across all programs: someone who
  // came back to any program has returned. Raised once per person, ever.
  const totals = await txRows<{ person_id: string; total: number; last: string }>(
    tx,
    `SELECT a.person_id, count(*)::int AS total, max(s.date) AS last
       FROM attendance a JOIN sessions s ON s.id = a.session_id AND s.archived_at IS NULL
      WHERE a.person_id = ANY($1::uuid[]) AND a.present
      GROUP BY a.person_id`,
    [personIds],
  );
  const totalByPerson = new Map(totals.map((t) => [t.person_id, t.total]));
  const firstTimerDue = new Set<string>();
  for (const t of totals) {
    if (
      active.has(t.person_id) &&
      t.total === 1 &&
      daysBetween(t.last, today) > firstTimerDays &&
      followUpsFor(t.person_id, "first_timer").length === 0
    ) {
      firstTimerDue.add(t.person_id);
    }
  }

  // People who stop coming stay in Follow-Ups for as long as they are away, on one card
  // labelled with the most specific reason. The card closes when they come back. Only the
  // admin can remove someone. "Stopped coming" means they missed the latest service of
  // every program they attend, so a Sunday regular is not flagged for skipping midweek.
  const rowsByPerson = new Map<string, typeof programRows>();
  for (const r of programRows) {
    if (!rowsByPerson.has(r.personId)) rowsByPerson.set(r.personId, []);
    rowsByPerson.get(r.personId)!.push(r);
  }
  for (const [personId, rows] of rowsByPerson) {
    if (!active.has(personId)) continue;
    const notComing = rows.every((r) => r.trailingMisses >= 1);
    const open = existing.filter((f) => f.person_id === personId && f.status === "open" && CARE_REASONS.includes(f.reason));
    const specific = firstTimerDue.has(personId) ? "first_timer" : dropOffDue.has(personId) ? "drop_off" : null;

    if (specific) {
      if (open.length) await tx.query(`UPDATE follow_ups SET reason = $2 WHERE id = $1`, [open[0].id, specific]);
      else await tx.query(`INSERT INTO follow_ups (person_id, reason, priority) VALUES ($1, $2, 'normal')`, [personId, specific]);
    } else if (notComing || absenceDue.has(personId)) {
      if (!open.length) await tx.query(`INSERT INTO follow_ups (person_id, reason, priority) VALUES ($1, 'absence', 'normal')`, [personId]);
    } else if (!rows.some((r) => r.status === STATUS.droppedOff)) {
      // Back at church. A first timer with no later service has not returned yet, so stays open.
      const attended = totalByPerson.get(personId) ?? 0;
      const toClose = open.filter((f) => f.reason !== "first_timer" || attended > 1).map((f) => f.id);
      if (toClose.length) await tx.query(`UPDATE follow_ups SET status = 'done' WHERE id = ANY($1::uuid[])`, [toClose]);
    }
  }
}

/** Applies a tag, and raises the high-priority follow-up when it is the Altar Call tag. */
export async function applyTag(tx: Tx, personId: string, tagName: string): Promise<void> {
  const tag = await txOne<{ id: string }>(tx, `SELECT id FROM tags WHERE name = $1`, [tagName]);
  if (!tag) throw new Error(`Unknown tag ${tagName}`);
  await tx.query(
    `INSERT INTO person_tags (person_id, tag_id) VALUES ($1, $2)
     ON CONFLICT (person_id, tag_id) WHERE removed_at IS NULL DO NOTHING`,
    [personId, tag.id],
  );
  if (tagName === TAG_ALTAR_CALL) await ensureAltarFollowUp(tx, personId);
}

export async function removeTag(tx: Tx, personId: string, tagName: string): Promise<void> {
  await tx.query(
    `UPDATE person_tags SET removed_at = now()
      WHERE person_id = $1 AND removed_at IS NULL
        AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
    [personId, tagName],
  );
}

export async function ensureAltarFollowUp(tx: Tx, personId: string): Promise<void> {
  const open = await txOne(
    tx,
    `SELECT 1 AS x FROM follow_ups WHERE person_id = $1 AND reason = 'altar_call' AND status = 'open'`,
    [personId],
  );
  if (!open) {
    await tx.query(`INSERT INTO follow_ups (person_id, reason, priority) VALUES ($1, 'altar_call', 'high')`, [personId]);
  }
}

/** Section 5.3: rebuild the miss counter, then move active -> waiting_corner if it reached 2. */
export async function applyDepartmentState(tx: Tx, personId: string, departmentId: string): Promise<number> {
  const marks = await txRows<{ date: string; present: boolean; recorded_at: Date }>(
    tx,
    `SELECT s.date, da.present, da.recorded_at
       FROM department_attendance da JOIN sessions s ON s.id = da.session_id
      WHERE da.person_id = $1 AND da.department_id = $2 AND s.archived_at IS NULL
      ORDER BY s.date, s.created_at`,
    [personId, departmentId],
  );
  const restored = await txOne<{ occurred_at: Date; local_date: string }>(
    tx,
    `SELECT occurred_at, (occurred_at AT TIME ZONE $3)::date AS local_date
       FROM department_events
      WHERE person_id = $1 AND department_id = $2 AND event_type = 'restored'
      ORDER BY occurred_at DESC LIMIT 1`,
    [personId, departmentId, process.env.CHURCH_TIMEZONE || "UTC"],
  );
  const missStreak = computeMissStreak(
    marks.map((m) => ({ date: m.date, present: m.present, recordedAt: m.recorded_at })),
    restored?.occurred_at ?? null,
    restored?.local_date ?? null,
  );
  await writeMissStreak(tx, personId, departmentId, missStreak);

  const membership = await txOne<{ id: string; status: string }>(
    tx,
    `SELECT id, status FROM department_memberships
      WHERE person_id = $1 AND department_id = $2 AND removed_at IS NULL`,
    [personId, departmentId],
  );
  if (membership && shouldEnterWaitingCorner(missStreak, membership.status)) {
    await tx.query(`UPDATE department_memberships SET status = 'waiting_corner' WHERE id = $1`, [membership.id]);
    await tx.query(
      `INSERT INTO department_events (person_id, department_id, event_type, miss_count_at_event)
       VALUES ($1, $2, 'entered_waiting_corner', $3)`,
      [personId, departmentId, missStreak],
    );
  }
  return missStreak;
}

export async function writeMissStreak(tx: Tx, personId: string, departmentId: string, missStreak: number) {
  await tx.query(
    `INSERT INTO person_department_stats (person_id, department_id, miss_streak) VALUES ($1, $2, $3)
     ON CONFLICT (person_id, department_id) DO UPDATE SET miss_streak = EXCLUDED.miss_streak, computed_at = now()`,
    [personId, departmentId, missStreak],
  );
}

/** Every department owes a review for every session it existed for. */
export async function ensurePendingReviews(tx: Tx): Promise<void> {
  await tx.query(
    `INSERT INTO service_reviews (department_id, session_id)
     SELECT d.id, s.id
       FROM departments d
       JOIN sessions s ON s.archived_at IS NULL
                      AND s.date >= (d.created_at AT TIME ZONE $1)::date
      WHERE d.archived_at IS NULL
     ON CONFLICT (department_id, session_id) DO NOTHING`,
    [process.env.CHURCH_TIMEZONE || "UTC"],
  );
}

/**
 * "No scan on a service day = missed." Writes an absent mark for each current member
 * of a department with no mark on this session, then applies the state machine.
 */
export async function closeOutSession(tx: Tx, sessionId: string, departmentId?: string): Promise<number> {
  const missing = await txRows<{ person_id: string; department_id: string }>(
    tx,
    `SELECT m.person_id, m.department_id
       FROM department_memberships m
       JOIN people p ON p.id = m.person_id AND p.status = 'active'
       JOIN departments d ON d.id = m.department_id AND d.archived_at IS NULL
       JOIN sessions s ON s.id = $1 AND s.archived_at IS NULL
      WHERE m.removed_at IS NULL
        AND (m.joined_at AT TIME ZONE $3)::date <= s.date
        AND ($2::uuid IS NULL OR m.department_id = $2)
        AND NOT EXISTS (
          SELECT 1 FROM department_attendance da
           WHERE da.session_id = s.id AND da.person_id = m.person_id AND da.department_id = m.department_id
        )`,
    [sessionId, departmentId ?? null, process.env.CHURCH_TIMEZONE || "UTC"],
  );
  for (const m of missing) {
    await tx.query(
      `INSERT INTO department_attendance (session_id, person_id, department_id, present, method)
       VALUES ($1, $2, $3, false, 'admin')`,
      [sessionId, m.person_id, m.department_id],
    );
    await applyDepartmentState(tx, m.person_id, m.department_id);
  }
  return missing.length;
}

export interface DailyResult {
  today: string;
  sessionsClosed: number;
  missesRecorded: number;
  peopleRecomputed: number;
  rateLimitRowsPruned: number;
}

/** The daily job: closes past services, then refreshes every time-based status. */
export async function runDaily(tx: Tx, today = churchToday()): Promise<DailyResult> {
  await ensurePendingReviews(tx);
  const past = await txRows<{ id: string }>(
    tx,
    `SELECT id FROM sessions WHERE archived_at IS NULL AND date < $1 ORDER BY date, created_at`,
    [today],
  );
  let missesRecorded = 0;
  for (const s of past) missesRecorded += await closeOutSession(tx, s.id);

  const people = await txRows<{ id: string }>(tx, `SELECT id FROM people WHERE status = 'active'`);
  const ids = people.map((p) => p.id);
  await recomputePeople(tx, ids, today);

  const pruned = await tx.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  return {
    today,
    sessionsClosed: past.length,
    missesRecorded,
    peopleRecomputed: ids.length,
    rateLimitRowsPruned: pruned.rowCount ?? 0,
  };
}
