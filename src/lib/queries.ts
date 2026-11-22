import { today } from "./config";
import { one, query } from "./db";
import { compareMonths, serviceChanges, summariseMonth } from "./engine";
import { requiredMembersSql } from "./services";

const TZ = () => process.env.CHURCH_TIMEZONE || "UTC";

// ---------------------------------------------------------------- dashboard
export async function dashboard() {
  const d = today();
  const row = await one<{
    attendance_today: number;
    workers_today: number;
    checked_in_today: number;
    altar_call_today: number;
    academy_ready: number;
    pending_reviews: number;
    open_follow_ups: number;
    absence_alerts: number;
    waiting_corner: number;
  }>(
    `SELECT
       (SELECT coalesce(sum(h.male + h.female + h.children), 0)::int FROM service_headcounts h JOIN sessions s ON s.id = h.session_id
         WHERE s.date = $1 AND s.archived_at IS NULL) AS attendance_today,
       (SELECT count(DISTINCT da.person_id)::int FROM department_attendance da JOIN sessions s ON s.id = da.session_id
         WHERE s.date = $1 AND s.archived_at IS NULL AND da.present) AS workers_today,
       (SELECT count(DISTINCT a.person_id)::int FROM attendance a JOIN sessions s ON s.id = a.session_id
         WHERE s.date = $1 AND s.archived_at IS NULL AND a.present AND a.method = 'qr') AS checked_in_today,
       (SELECT count(DISTINCT a.person_id)::int FROM attendance a JOIN sessions s ON s.id = a.session_id
         WHERE s.date = $1 AND s.archived_at IS NULL AND a.altar_call) AS altar_call_today,
       (SELECT count(*)::int FROM person_academy_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
         WHERE st.ready_since IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.person_id = st.person_id)) AS academy_ready,
       (SELECT count(*)::int FROM service_reviews r
          JOIN sessions s ON s.id = r.session_id AND s.archived_at IS NULL AND s.date <= $1
          JOIN departments d ON d.id = r.department_id AND d.archived_at IS NULL
         WHERE r.status = 'pending') AS pending_reviews,
       (SELECT count(*)::int FROM follow_ups WHERE status = 'open') AS open_follow_ups,
       (SELECT count(*)::int FROM absence_alerts WHERE NOT resolved) AS absence_alerts,
       (SELECT count(*)::int FROM department_memberships WHERE status = 'waiting_corner' AND removed_at IS NULL) AS waiting_corner`,
    [d],
  );
  return { date: d, ...row! };
}

export const todaysServices = () =>
  query(
    `SELECT s.id, s.program_id, p.name AS program_name,
            (h.male + h.female + h.children)::int AS present_count
       FROM sessions s JOIN programs p ON p.id = s.program_id AND p.archived_at IS NULL
       LEFT JOIN service_headcounts h ON h.session_id = s.id
      WHERE s.date = $1 AND s.archived_at IS NULL ORDER BY s.created_at`,
    [today()],
  );

// ---------------------------------------------------------------- people
export async function listPeople(opts: { q?: string; tag?: string; status?: string; limit?: number; offset?: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.q) {
    params.push(`%${opts.q.trim().toLowerCase()}%`);
    where.push(`(lower(p.full_name) LIKE $${params.length} OR lower(coalesce(p.phone,'')) LIKE $${params.length} OR lower(coalesce(p.email,'')) LIKE $${params.length})`);
  }
  if (opts.status && opts.status !== "all") {
    params.push(opts.status);
    where.push(`p.status = $${params.length}`);
  }
  if (opts.tag) {
    params.push(opts.tag);
    where.push(`EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = $${params.length} AND pt.removed_at IS NULL)`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countParams = [...params];
  params.push(opts.limit ?? 50, opts.offset ?? 0);
  const rows = await query(
    `SELECT p.id, p.full_name, p.phone, p.email, p.status, p.first_visit_date, p.created_at,
            coalesce((SELECT array_agg(t.name ORDER BY t.name) FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
                       WHERE pt.person_id = p.id AND pt.removed_at IS NULL), '{}') AS tags
       FROM people p ${clause}
      ORDER BY lower(p.full_name)
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM people p ${clause}`, countParams);
  return { rows, total: total?.n ?? 0 };
}

export const listTags = () => query<{ id: string; name: string }>(`SELECT id, name FROM tags ORDER BY name`);

export async function personProfile(id: string) {
  const person = await one(`SELECT * FROM people WHERE id = $1`, [id]);
  if (!person) return null;
  const [tags, attendance, stats, academy, memberships, events, followUps, enrollment, alerts, duplicates, departmentAttendance] =
    await Promise.all([
      query(
        `SELECT t.name, pt.applied_at, pt.removed_at FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.person_id = $1 ORDER BY pt.applied_at DESC`,
        [id],
      ),
      query(
        `SELECT a.id, a.present, a.altar_call, a.method, a.recorded_at, s.date, p.name AS program_name
           FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN programs p ON p.id = s.program_id
          WHERE a.person_id = $1 ORDER BY s.date DESC, s.created_at DESC LIMIT 100`,
        [id],
      ),
      query(
        `SELECT st.*, coalesce(p.name, 'General (all counting programs)') AS program_name
           FROM person_program_stats st LEFT JOIN programs p ON p.id = st.program_id
          WHERE st.person_id = $1 ORDER BY st.program_id IS NOT NULL, p.name`,
        [id],
      ),
      one(`SELECT * FROM person_academy_stats WHERE person_id = $1`, [id]),
      query(
        `SELECT m.*, d.name AS department_name, coalesce(st.miss_streak, 0) AS miss_streak
           FROM department_memberships m JOIN departments d ON d.id = m.department_id
           LEFT JOIN person_department_stats st ON st.person_id = m.person_id AND st.department_id = m.department_id
          WHERE m.person_id = $1 ORDER BY m.removed_at IS NULL DESC, m.joined_at DESC`,
        [id],
      ),
      query(
        `SELECT e.*, d.name AS department_name FROM department_events e JOIN departments d ON d.id = e.department_id
          WHERE e.person_id = $1 ORDER BY e.occurred_at DESC`,
        [id],
      ),
      query(`SELECT * FROM follow_ups WHERE person_id = $1 ORDER BY created_at DESC`, [id]),
      one(`SELECT * FROM enrollments WHERE person_id = $1`, [id]),
      query(
        `SELECT a.*, p.name AS program_name FROM absence_alerts a JOIN programs p ON p.id = a.program_id
          WHERE a.person_id = $1 ORDER BY a.triggered_at DESC`,
        [id],
      ),
      query(
        `SELECT pd.id, pd.matched_on, pd.status, o.id AS other_id, o.full_name AS other_name
           FROM possible_duplicates pd
           JOIN people o ON o.id = CASE WHEN pd.person_id = $1 THEN pd.matched_person_id ELSE pd.person_id END
          WHERE (pd.person_id = $1 OR pd.matched_person_id = $1) AND pd.status = 'open'`,
        [id],
      ),
      query(
        `SELECT da.present, da.method, s.date, d.name AS department_name, p.name AS program_name
           FROM department_attendance da JOIN sessions s ON s.id = da.session_id
           JOIN programs p ON p.id = s.program_id JOIN departments d ON d.id = da.department_id
          WHERE da.person_id = $1 ORDER BY s.date DESC LIMIT 50`,
        [id],
      ),
    ]);
  return { person, tags, attendance, stats, academy, memberships, events, followUps, enrollment, alerts, duplicates, departmentAttendance };
}

export const openDuplicates = () =>
  query(
    `SELECT pd.id, pd.matched_on, pd.created_at, a.id AS person_id, a.full_name AS person_name, a.phone AS person_phone,
            b.id AS matched_id, b.full_name AS matched_name, b.phone AS matched_phone
       FROM possible_duplicates pd
       JOIN people a ON a.id = pd.person_id JOIN people b ON b.id = pd.matched_person_id
      WHERE pd.status = 'open' ORDER BY pd.created_at DESC`,
  );

// ---------------------------------------------------------------- programs
export const listPrograms = (includeArchived = false) =>
  query(
    `SELECT p.*,
            (SELECT count(*)::int FROM sessions s WHERE s.program_id = p.id AND s.archived_at IS NULL) AS session_count,
            (SELECT max(s.date) FROM sessions s WHERE s.program_id = p.id AND s.archived_at IS NULL) AS last_session
       FROM programs p
      ${includeArchived ? "" : "WHERE p.archived_at IS NULL"}
      ORDER BY p.archived_at IS NOT NULL, p.is_sunday DESC, p.type, p.name`,
  );

export const getProgram = (id: string) => one(`SELECT * FROM programs WHERE id = $1`, [id]);

export const listSessions = (programId: string) =>
  query(
    `SELECT s.*, h.male, h.female, h.children,
            (h.male + h.female + h.children)::int AS present_count,
            (SELECT count(*)::int FROM attendance a WHERE a.session_id = s.id AND a.altar_call) AS altar_count
       FROM sessions s LEFT JOIN service_headcounts h ON h.session_id = s.id
      WHERE s.program_id = $1 AND s.archived_at IS NULL ORDER BY s.date DESC`,
    [programId],
  );

export const recentSessions = (limit = 30) =>
  query(
    `SELECT s.id, s.date, p.name AS program_name
       FROM sessions s JOIN programs p ON p.id = s.program_id AND p.archived_at IS NULL
      WHERE s.archived_at IS NULL AND s.date <= $1
      ORDER BY s.date DESC, s.created_at DESC LIMIT $2`,
    [today(), limit],
  );

// ---------------------------------------------------------------- engagement
export const ENGAGEMENT_VIEWS: Record<string, string> = {
  "first-timers": "First Timer",
  occasional: "Occasional",
  consistent: "Consistent",
  "dropped-off": "Dropped Off",
  "never-returned": "Never Returned",
};

export async function engagementView(view: string, programId: string | null) {
  return query(
    `SELECT st.person_id, p.full_name, p.phone, st.current_streak, st.total_attended, st.last_attended, st.trailing_misses
       FROM person_program_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
      WHERE st.status_badge = $1 AND st.program_id IS NOT DISTINCT FROM $2::uuid
      ORDER BY st.last_attended DESC NULLS LAST, p.full_name LIMIT 500`,
    [ENGAGEMENT_VIEWS[view], programId],
  );
}

export const engagementCounts = (programId: string | null) =>
  query<{ status_badge: string; n: number }>(
    `SELECT st.status_badge, count(*)::int AS n
       FROM person_program_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
      WHERE st.program_id IS NOT DISTINCT FROM $1::uuid GROUP BY st.status_badge`,
    [programId],
  );

export const absenceAlerts = (includeResolved = false) =>
  query(
    `SELECT a.id, a.person_id, a.triggered_at, a.resolved, p.full_name, p.phone, pr.name AS program_name
       FROM absence_alerts a JOIN people p ON p.id = a.person_id JOIN programs pr ON pr.id = a.program_id
      WHERE p.status = 'active' ${includeResolved ? "" : "AND NOT a.resolved"}
      ORDER BY a.triggered_at DESC`,
  );

// ---------------------------------------------------------------- altar call
/** With a session, also says whether each person was marked at that service. */
export const altarCallMonitor = (sessionId: string | null = null) =>
  query(
    `SELECT p.id, p.full_name, p.phone, pt.applied_at,
            mark.id AS mark_id, coalesce(mark.present, false) AS came, coalesce(mark.altar_call, false) AS came_forward,
            coalesce((SELECT max(st.current_streak) FROM person_program_stats st WHERE st.person_id = p.id), 0) AS streak,
            coalesce((SELECT a.sunday_streak FROM person_academy_stats a WHERE a.person_id = p.id), 0) AS sunday_streak,
            (SELECT f.id FROM follow_ups f WHERE f.person_id = p.id AND f.status = 'open' AND f.priority = 'high'
              ORDER BY f.created_at DESC LIMIT 1) AS open_priority_follow_up,
            EXISTS (SELECT 1 FROM enrollments e WHERE e.person_id = p.id) AS enrolled
       FROM person_tags pt
       JOIN tags t ON t.id = pt.tag_id AND t.name = 'Altar Call'
       JOIN people p ON p.id = pt.person_id AND p.status = 'active'
       LEFT JOIN attendance mark ON mark.person_id = p.id AND mark.session_id = $1::uuid
      WHERE pt.removed_at IS NULL
      ORDER BY streak DESC, p.full_name`,
    [sessionId],
  );

// ---------------------------------------------------------------- academy
export const academyReady = () =>
  query(
    `SELECT p.id, p.full_name, p.phone, st.sunday_streak, st.ready_since,
            EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id AND t.name = 'Altar Call'
                     WHERE pt.person_id = p.id AND pt.removed_at IS NULL) AS altar_call
       FROM person_academy_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
      WHERE st.ready_since IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.person_id = p.id)
      ORDER BY altar_call DESC, st.ready_since, p.full_name`,
  );

export const academyEnrolled = () =>
  query(
    `SELECT p.id, p.full_name, p.phone, e.enrolled_at, e.note
       FROM enrollments e JOIN people p ON p.id = e.person_id ORDER BY e.enrolled_at DESC`,
  );

// ---------------------------------------------------------------- departments
export const listDepartments = (includeArchived = false) =>
  query(
    `SELECT d.*,
            (SELECT count(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.removed_at IS NULL AND m.status = 'active') AS active_count,
            (SELECT count(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.removed_at IS NULL AND m.status = 'waiting_corner') AS waiting_count,
            (SELECT count(*)::int FROM department_memberships m WHERE m.department_id = d.id AND m.status = 'permanently_removed') AS removed_count
       FROM departments d
      ${includeArchived ? "" : "WHERE d.archived_at IS NULL"}
      ORDER BY d.archived_at IS NOT NULL, d.name`,
  );

export const getDepartment = (id: string) => one(`SELECT * FROM departments WHERE id = $1`, [id]);

export const departmentMembers = (departmentId: string) =>
  query(
    `SELECT m.id, m.person_id, m.status, m.joined_at, m.removed_at, p.full_name, p.phone,
            coalesce(st.miss_streak, 0) AS miss_streak
       FROM department_memberships m JOIN people p ON p.id = m.person_id
       LEFT JOIN person_department_stats st ON st.person_id = m.person_id AND st.department_id = m.department_id
      WHERE m.department_id = $1 AND (m.removed_at IS NULL OR m.status = 'permanently_removed')
      ORDER BY p.full_name`,
    [departmentId],
  );

export const departmentSessionRoster = (departmentId: string, sessionId: string) =>
  query(
    `SELECT m.person_id, p.full_name, m.status, da.present, da.method, da.recorded_at,
            coalesce(st.miss_streak, 0) AS miss_streak
       FROM department_memberships m JOIN people p ON p.id = m.person_id AND p.status = 'active'
       LEFT JOIN department_attendance da
              ON da.person_id = m.person_id AND da.department_id = m.department_id AND da.session_id = $2
       LEFT JOIN person_department_stats st ON st.person_id = m.person_id AND st.department_id = m.department_id
      WHERE m.department_id = $1 AND m.removed_at IS NULL
      ORDER BY p.full_name`,
    [departmentId, sessionId],
  );

export const waitingCorner = () =>
  query(
    `SELECT m.person_id, m.department_id, d.name AS department_name, p.full_name, p.phone,
            coalesce(st.miss_streak, 0) AS miss_streak,
            (SELECT coalesce(json_agg(json_build_object(
                      'event_type', e.event_type, 'occurred_at', e.occurred_at,
                      'miss_count_at_event', e.miss_count_at_event, 'note', e.note) ORDER BY e.occurred_at DESC), '[]')
               FROM department_events e
              WHERE e.person_id = m.person_id AND e.department_id = m.department_id) AS events,
            (SELECT coalesce(json_agg(json_build_object('date', x.date, 'program', x.program) ORDER BY x.date DESC), '[]')
               FROM (SELECT s.date, pr.name AS program
                       FROM department_attendance da JOIN sessions s ON s.id = da.session_id
                       JOIN programs pr ON pr.id = s.program_id
                      WHERE da.person_id = m.person_id AND da.department_id = m.department_id AND NOT da.present
                      ORDER BY s.date DESC LIMIT 6) x) AS misses
       FROM department_memberships m
       JOIN people p ON p.id = m.person_id AND p.status = 'active'
       JOIN departments d ON d.id = m.department_id
       LEFT JOIN person_department_stats st ON st.person_id = m.person_id AND st.department_id = m.department_id
      WHERE m.status = 'waiting_corner' AND m.removed_at IS NULL
      ORDER BY d.name, p.full_name`,
  );

// ---------------------------------------------------------------- reviews
export const listReviews = (status?: "pending" | "submitted", departmentId?: string) =>
  query(
    `SELECT r.id, r.status, r.submitted_at, r.summary, r.challenges, r.highlights, r.department_id, r.session_id,
            d.name AS department_name, s.date, p.name AS program_name
       FROM service_reviews r
       JOIN departments d ON d.id = r.department_id AND d.archived_at IS NULL
       JOIN sessions s ON s.id = r.session_id AND s.archived_at IS NULL AND s.date <= $1
       JOIN programs p ON p.id = s.program_id
      WHERE ($2::text IS NULL OR r.status = $2) AND ($3::uuid IS NULL OR r.department_id = $3)
      ORDER BY s.date DESC, p.name, d.name LIMIT 300`,
    [today(), status ?? null, departmentId ?? null],
  );

export async function reviewDetail(departmentId: string, sessionId: string) {
  const session = await one<{ id: string; date: string; program_name: string }>(
    `SELECT s.id, s.date, p.name AS program_name FROM sessions s JOIN programs p ON p.id = s.program_id WHERE s.id = $1`,
    [sessionId],
  );
  const department = await one<{ id: string; name: string }>(`SELECT id, name FROM departments WHERE id = $1`, [departmentId]);
  if (!session || !department) return null;
  const review = await one(`SELECT * FROM service_reviews WHERE department_id = $1 AND session_id = $2`, [departmentId, sessionId]);
  const members = await query<{ id: string; full_name: string; status: string }>(requiredMembersSql, [departmentId, session.date, TZ()]);
  const notes = review ? await query<{ person_id: string; note: string }>(`SELECT person_id, note FROM member_notes WHERE review_id = $1`, [review.id]) : [];
  return { session, department, review, members, notes };
}

// ---------------------------------------------------------------- follow-ups
export const listFollowUps = (status: string = "open") =>
  query(
    `SELECT f.*, p.full_name, p.phone, p.status AS person_status,
            (SELECT max(s.date) FROM attendance a JOIN sessions s ON s.id = a.session_id AND s.archived_at IS NULL
              WHERE a.person_id = f.person_id AND a.present) AS last_came
       FROM follow_ups f JOIN people p ON p.id = f.person_id
      WHERE ($1 = 'all' OR f.status = $1)
      ORDER BY f.status, f.priority = 'high' DESC, f.created_at DESC LIMIT 1000`,
    [status],
  );

// ---------------------------------------------------------------- audit
export const listAudit = (limit = 100, offset = 0) =>
  query(`SELECT * FROM audit_log ORDER BY id DESC LIMIT $1 OFFSET $2`, [limit, offset]);

// ---------------------------------------------------------------- reports
export const REPORT_TYPES = ["attendance-trends", "engagement-funnel", "academy-pipeline", "review-completion", "department-attendance"] as const;

export async function report(type: string) {
  const d = today();
  switch (type) {
    case "attendance-trends":
      return query(
        `SELECT s.date, p.name AS program_name, h.male, h.female, h.children,
                (h.male + h.female + h.children)::int AS present,
                (SELECT count(*)::int FROM attendance a WHERE a.session_id = s.id AND a.altar_call) AS altar_call
           FROM sessions s JOIN programs p ON p.id = s.program_id AND p.archived_at IS NULL
           JOIN service_headcounts h ON h.session_id = s.id
          WHERE s.archived_at IS NULL AND s.date <= $1
          ORDER BY s.date DESC LIMIT 60`,
        [d],
      ).then((rows) => rows.reverse());
    case "engagement-funnel":
      return query(
        `SELECT coalesce(pr.name, 'General') AS program_name, st.program_id, st.status_badge, count(*)::int AS n
           FROM person_program_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
           LEFT JOIN programs pr ON pr.id = st.program_id
          GROUP BY pr.name, st.program_id, st.status_badge ORDER BY program_name`,
      );
    case "academy-pipeline":
      return query(
        `WITH base AS (
           SELECT st.person_id, st.sunday_streak, st.ready_since,
                  EXISTS (SELECT 1 FROM enrollments e WHERE e.person_id = st.person_id) AS enrolled
             FROM person_academy_stats st JOIN people p ON p.id = st.person_id AND p.status = 'active'
         )
         SELECT 'Attending, no streak' AS stage, 1 AS ord, count(*) FILTER (WHERE sunday_streak = 0 AND ready_since IS NULL AND NOT enrolled)::int AS n FROM base
         UNION ALL SELECT '1 Sunday', 2, count(*) FILTER (WHERE sunday_streak = 1 AND ready_since IS NULL AND NOT enrolled)::int FROM base
         UNION ALL SELECT '2 Sundays', 3, count(*) FILTER (WHERE sunday_streak = 2 AND ready_since IS NULL AND NOT enrolled)::int FROM base
         UNION ALL SELECT '3 Sundays', 4, count(*) FILTER (WHERE sunday_streak = 3 AND ready_since IS NULL AND NOT enrolled)::int FROM base
         UNION ALL SELECT 'Ready', 5, count(*) FILTER (WHERE ready_since IS NOT NULL AND NOT enrolled)::int FROM base
         UNION ALL SELECT 'Enrolled', 6, count(*) FILTER (WHERE enrolled)::int FROM base
         ORDER BY ord`,
      );
    case "review-completion":
      return query(
        `SELECT d.name AS department_name,
                count(*) FILTER (WHERE r.status = 'submitted')::int AS submitted,
                count(*) FILTER (WHERE r.status = 'pending')::int AS pending
           FROM service_reviews r
           JOIN departments d ON d.id = r.department_id AND d.archived_at IS NULL
           JOIN sessions s ON s.id = r.session_id AND s.archived_at IS NULL AND s.date <= $1
          GROUP BY d.name ORDER BY d.name`,
        [d],
      );
    case "department-attendance":
      return query(
        `SELECT d.name AS department_name,
                count(*) FILTER (WHERE da.present)::int AS present,
                count(*) FILTER (WHERE NOT da.present)::int AS missed
           FROM departments d
           LEFT JOIN department_attendance da ON da.department_id = d.id
          WHERE d.archived_at IS NULL
          GROUP BY d.name ORDER BY d.name`,
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------- monthly attendance
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month: string, short = false) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", short ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * The monthly count: the headcount entered for each service. Services are listed and
 * averaged, never added together, and a service with no numbers yet is left out of the
 * averages rather than counted as zero. Opens on the last complete month by default.
 */
export async function monthlyAttendance(requestedMonth?: string | null, requestedProgram?: string | null) {
  const d = today();
  const current = d.slice(0, 7);
  const month = requestedMonth && MONTH.test(requestedMonth) && requestedMonth <= current ? requestedMonth : shiftMonth(current, -1);
  const programs = await query<{ id: string; name: string }>(`SELECT id, name FROM programs WHERE archived_at IS NULL ORDER BY is_sunday DESC, name`);
  const programId = programs.some((p) => p.id === requestedProgram) ? requestedProgram! : null;

  const rows = await query<{
    id: string; program_id: string; date: string; program_name: string; month: string;
    male: number | null; female: number | null; children: number | null; present: number | null;
  }>(
    `SELECT s.id, s.program_id, s.date, p.name AS program_name, to_char(s.date, 'YYYY-MM') AS month,
            h.male, h.female, h.children, (h.male + h.female + h.children)::int AS present
       FROM sessions s JOIN programs p ON p.id = s.program_id AND p.archived_at IS NULL
       LEFT JOIN service_headcounts h ON h.session_id = s.id
      WHERE s.archived_at IS NULL AND s.date <= $1 AND ($2::uuid IS NULL OR s.program_id = $2)
      ORDER BY s.date, s.created_at`,
    [d, programId],
  );
  const inMonth = (m: string) => rows.filter((r) => r.month === m);
  const countsIn = (m: string) => inMonth(m).filter((r) => r.present !== null).map((r) => r.present!);
  const selected = inMonth(month);
  const entered = selected.filter((r) => r.present !== null);
  const counts = countsIn(month);
  const changes = serviceChanges(counts);
  const changeById = new Map(entered.map((r, i) => [r.id, changes[i]]));
  const summary = summariseMonth(counts);
  const previousMonth = shiftMonth(month, -1);
  const previous = summariseMonth(countsIn(previousMonth));
  const averageOf = (key: "male" | "female" | "children") =>
    entered.length ? Math.round((entered.reduce((sum, r) => sum + r[key]!, 0) / entered.length) * 10) / 10 : 0;

  const earliest = rows[0]?.month ?? current;
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    const s = summariseMonth(countsIn(m));
    if (s.serviceCount > 0) trend.push({ date: m, label: monthLabel(m, true), value: s.average, services: s.serviceCount });
  }

  const months: { value: string; label: string }[] = [];
  for (let m = current; m >= earliest; m = shiftMonth(m, -1)) months.push({ value: m, label: monthLabel(m) });
  if (!months.some((m) => m.value === month)) months.push({ value: month, label: monthLabel(month) });

  return {
    month,
    label: monthLabel(month),
    inProgress: month === current,
    months,
    programs,
    programId,
    summary,
    breakdown: { male: averageOf("male"), female: averageOf("female"), children: averageOf("children") },
    notEntered: selected.length - entered.length,
    previous: { label: monthLabel(previousMonth), ...previous },
    comparison: compareMonths(summary, previous),
    services: selected.map((r) => ({
      id: r.id, program_id: r.program_id, date: r.date, program_name: r.program_name,
      male: r.male, female: r.female, children: r.children, present: r.present, change: changeById.get(r.id) ?? null,
    })),
    trend,
  };
}

// ---------------------------------------------------------------- export
export const EXPORT_QUERIES: Record<string, string> = {
  people: `SELECT id, full_name, phone, email, gender, address, first_visit_date, source, status, created_at FROM people ORDER BY full_name`,
  tags: `SELECT id, name FROM tags ORDER BY name`,
  person_tags: `SELECT pt.id, pt.person_id, p.full_name, t.name AS tag, pt.applied_at, pt.removed_at FROM person_tags pt JOIN people p ON p.id = pt.person_id JOIN tags t ON t.id = pt.tag_id ORDER BY pt.applied_at`,
  programs: `SELECT id, name, type, counts_toward_streak, is_sunday, qr_token, created_at, archived_at FROM programs ORDER BY name`,
  sessions: `SELECT s.id, s.program_id, p.name AS program, s.date, s.notes, s.archived_at FROM sessions s JOIN programs p ON p.id = s.program_id ORDER BY s.date`,
  service_headcounts: `SELECT h.id, h.session_id, s.date, pr.name AS program, h.male, h.female, h.children, h.male + h.female + h.children AS total, h.recorded_by, h.recorded_at FROM service_headcounts h JOIN sessions s ON s.id = h.session_id JOIN programs pr ON pr.id = s.program_id ORDER BY s.date`,
  attendance: `SELECT a.id, a.session_id, s.date, pr.name AS program, a.person_id, p.full_name, a.present, a.altar_call, a.recorded_by, a.method, a.recorded_at FROM attendance a JOIN sessions s ON s.id = a.session_id JOIN programs pr ON pr.id = s.program_id JOIN people p ON p.id = a.person_id ORDER BY s.date, p.full_name`,
  departments: `SELECT id, name, qr_token, created_at, archived_at FROM departments ORDER BY name`,
  department_memberships: `SELECT m.id, m.person_id, p.full_name, m.department_id, d.name AS department, m.status, m.joined_at, m.removed_at FROM department_memberships m JOIN people p ON p.id = m.person_id JOIN departments d ON d.id = m.department_id ORDER BY d.name, p.full_name`,
  department_attendance: `SELECT da.id, da.session_id, s.date, da.person_id, p.full_name, da.department_id, d.name AS department, da.present, da.method, da.recorded_at FROM department_attendance da JOIN sessions s ON s.id = da.session_id JOIN people p ON p.id = da.person_id JOIN departments d ON d.id = da.department_id ORDER BY s.date, d.name, p.full_name`,
  department_events: `SELECT e.id, e.person_id, p.full_name, e.department_id, d.name AS department, e.event_type, e.miss_count_at_event, e.occurred_at, e.note FROM department_events e JOIN people p ON p.id = e.person_id JOIN departments d ON d.id = e.department_id ORDER BY e.occurred_at`,
  service_reviews: `SELECT r.id, r.department_id, d.name AS department, r.session_id, s.date, r.summary, r.challenges, r.highlights, r.submitted_at, r.status FROM service_reviews r JOIN departments d ON d.id = r.department_id JOIN sessions s ON s.id = r.session_id ORDER BY s.date, d.name`,
  member_notes: `SELECT n.id, n.review_id, n.person_id, p.full_name, n.note FROM member_notes n JOIN people p ON p.id = n.person_id ORDER BY n.review_id, p.full_name`,
  follow_ups: `SELECT f.id, f.person_id, p.full_name, f.reason, f.priority, f.assigned_to, f.status, f.notes, f.created_at FROM follow_ups f JOIN people p ON p.id = f.person_id ORDER BY f.created_at`,
  absence_alerts: `SELECT a.id, a.person_id, p.full_name, a.program_id, pr.name AS program, a.triggered_at, a.resolved FROM absence_alerts a JOIN people p ON p.id = a.person_id JOIN programs pr ON pr.id = a.program_id ORDER BY a.triggered_at`,
  enrollments: `SELECT e.id, e.person_id, p.full_name, e.enrolled_at, e.note FROM enrollments e JOIN people p ON p.id = e.person_id ORDER BY e.enrolled_at`,
  audit_log: `SELECT id, actor, action, entity, entity_id, before, after, created_at FROM audit_log ORDER BY id`,
};
