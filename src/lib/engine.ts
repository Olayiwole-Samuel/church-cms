// Pure business rules from section 5 of the specification. No I/O in this file,
// so every rule can be unit tested directly. See tests/engine.test.ts.

export const STATUS = {
  firstTimer: "First Timer",
  occasional: "Occasional",
  consistent: "Consistent",
  droppedOff: "Dropped Off",
  neverReturned: "Never Returned",
} as const;
export type StatusBadge = (typeof STATUS)[keyof typeof STATUS];

export const CONSISTENT_STREAK = 4;
export const ACADEMY_SUNDAYS = 4;
export const WAITING_CORNER_MISSES = 2;

export interface EngineConfig {
  firstTimerWindowDays: number; // FIRST_TIMER_WINDOW
  dropOffMisses: number; // N in "missed last N sessions"
  firstTimerFollowUpDays: number; // X in "no return after X days"
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** One session in date order, with this person's mark (undefined = no record). */
export interface SessionMark {
  date: string; // YYYY-MM-DD
  present: boolean | undefined;
}

/**
 * Past sessions with no record count as absent. A session dated today with no
 * record is still in progress, so it is not yet a miss. Future sessions never count.
 */
export function settledMarks(marks: SessionMark[], today: string): { date: string; present: boolean }[] {
  return marks
    .filter((m) => m.date < today || (m.date === today && m.present !== undefined))
    .map((m) => ({ date: m.date, present: m.present === true }));
}

/** Section 5.1 loop: walk sessions descending from the latest, stop at the first miss. */
export function streakOf(settled: { present: boolean }[]): number {
  let streak = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].present) streak += 1;
    else break;
  }
  return streak;
}

export function trailingMissesOf(settled: { present: boolean }[]): number {
  let misses = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    if (!settled[i].present) misses += 1;
    else break;
  }
  return misses;
}

function longestRun(settled: { present: boolean }[]): number {
  let best = 0;
  let run = 0;
  for (const s of settled) {
    run = s.present ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface ProgramStats {
  currentStreak: number;
  status: StatusBadge;
  total: number;
  lastAttended: string | null;
  trailingMisses: number;
  wasConsistent: boolean;
  /** A Consistent member has now missed 2-3 straight (section 5.4). */
  absenceTriggered: boolean;
}

/** Section 5.1, per person per program. Returns null if the person never attended. */
export function computeProgramStats(
  marks: SessionMark[],
  countsTowardStreak: boolean,
  today: string,
  config: EngineConfig,
): ProgramStats | null {
  const settled = settledMarks(marks, today);
  const attended = settled.filter((s) => s.present);
  const total = attended.length;
  if (total === 0) return null;

  const last = attended[attended.length - 1].date;
  const streak = countsTowardStreak ? streakOf(settled) : 0;
  const trailingMisses = trailingMissesOf(settled);
  const wasConsistent = countsTowardStreak && longestRun(settled) >= CONSISTENT_STREAK;

  let status: StatusBadge;
  if (total === 1 && daysBetween(last, today) > config.firstTimerWindowDays) {
    status = STATUS.neverReturned;
  } else if (streak >= CONSISTENT_STREAK) {
    status = STATUS.consistent;
  } else if (total === 1) {
    status = STATUS.firstTimer;
  } else if (wasConsistent && trailingMisses >= config.dropOffMisses) {
    status = STATUS.droppedOff;
  } else {
    status = STATUS.occasional;
  }

  // "Consistent member misses 2-3 straight": the run just before the misses must
  // itself have reached the Consistent threshold.
  const beforeMisses = settled.slice(0, settled.length - trailingMisses);
  const absenceTriggered =
    countsTowardStreak &&
    trailingMisses >= 2 &&
    trailingMisses <= 3 &&
    trailingMisses < config.dropOffMisses &&
    streakOf(beforeMisses) >= CONSISTENT_STREAK;

  return { currentStreak: streak, status, total, lastAttended: last, trailingMisses, wasConsistent, absenceTriggered };
}

export interface SundaySessionMark {
  date: string;
  present: boolean | undefined;
}

export interface AcademyStats {
  sundayStreak: number;
  /** Date the 4th consecutive Sunday was first reached, or null if never. */
  readySince: string | null;
}

/**
 * Section 5.2. Pass only sessions from is_sunday programs. Several Sunday
 * programs on one date (first and second service) are one Sunday, and attending
 * either counts. Once reached, readiness stays until the admin enrolls the person.
 */
export function computeAcademyStats(sessions: SundaySessionMark[], today: string): AcademyStats {
  const byDate = new Map<string, boolean | undefined>();
  for (const s of sessions) {
    const prev = byDate.get(s.date);
    if (s.present === true || prev === true) byDate.set(s.date, true);
    else if (s.present === false || prev === false) byDate.set(s.date, false);
    else byDate.set(s.date, undefined);
  }
  const marks = [...byDate.entries()]
    .map(([date, present]) => ({ date, present }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const settled = settledMarks(marks, today);

  let run = 0;
  let readySince: string | null = null;
  for (const s of settled) {
    run = s.present ? run + 1 : 0;
    if (run >= ACADEMY_SUNDAYS && !readySince) readySince = s.date;
  }
  return { sundayStreak: streakOf(settled), readySince };
}

export interface DeptMark {
  date: string;
  present: boolean;
  recordedAt: string | Date;
}

/**
 * Section 5.3 miss counter, rebuilt from history. Restore resets it to 0, so marks
 * from before the latest restore are ignored. Marks must be in session date order.
 */
export function computeMissStreak(
  marks: DeptMark[],
  lastRestoredAt: string | Date | null,
  restoredOnDate: string | null,
): number {
  const restoredMs = lastRestoredAt ? new Date(lastRestoredAt).getTime() : null;
  const counted = marks.filter(
    (m) =>
      restoredMs === null ||
      (new Date(m.recordedAt).getTime() > restoredMs && (!restoredOnDate || m.date >= restoredOnDate)),
  );
  return trailingMissesOf(counted);
}

export const shouldEnterWaitingCorner = (missStreak: number, membershipStatus: string) =>
  missStreak >= WAITING_CORNER_MISSES && membershipStatus === "active";

export interface MonthSummary {
  serviceCount: number;
  /** Average present per service, to 1 decimal. Services are never added together. */
  average: number;
  highest: number;
  lowest: number;
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export function summariseMonth(presentPerService: number[]): MonthSummary {
  const serviceCount = presentPerService.length;
  if (serviceCount === 0) return { serviceCount: 0, average: 0, highest: 0, lowest: 0 };
  const total = presentPerService.reduce((a, b) => a + b, 0);
  return {
    serviceCount,
    average: oneDecimal(total / serviceCount),
    highest: Math.max(...presentPerService),
    lowest: Math.min(...presentPerService),
  };
}

/** Month against the month before. Null when either month had no services to compare. */
export function compareMonths(current: MonthSummary, previous: MonthSummary): { net: number; percent: number | null } | null {
  if (current.serviceCount === 0 || previous.serviceCount === 0) return null;
  const net = oneDecimal(current.average - previous.average);
  return { net, percent: previous.average === 0 ? null : oneDecimal((net / previous.average) * 100) };
}

/** Each service against the one before it, so 24 then 20 reads as a change of -4. */
export function serviceChanges(presentPerService: number[]): (number | null)[] {
  return presentPerService.map((present, i) => (i === 0 ? null : present - presentPerService[i - 1]));
}

export const isSundayDate =(date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

export const normalizePhone = (phone: string | null | undefined) => (phone ?? "").replace(/\D/g, "");
export const normalizeName = (name: string | null | undefined) =>
  (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Which of today's services a member check-in goes to: the one they chose, else the scanned
 * program's own service, else the only service today. "choose" when more than one could apply.
 */
export function pickCheckinSession<T extends { id: string; program_id: string }>(
  sessions: T[],
  opts: { chosenId?: string | null; preferredProgramId?: string | null },
): T | "choose" | null {
  if (opts.chosenId) return sessions.find((s) => s.id === opts.chosenId) ?? null;
  const own = opts.preferredProgramId ? sessions.find((s) => s.program_id === opts.preferredProgramId) : undefined;
  if (own) return own;
  if (sessions.length === 1) return sessions[0];
  return sessions.length > 1 ? "choose" : null;
}
