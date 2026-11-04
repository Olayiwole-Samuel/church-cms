// Runs every rule against a real, throwaway Postgres with the real migrations.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { today } from "../src/lib/config";
import { closePool, one, query, Tx, withTx } from "../src/lib/db";
import { monthlyAttendance } from "../src/lib/queries";
import { closeOutSession, recomputePeople, runDaily } from "../src/lib/recompute";
import {
  assignDepartment,
  createPerson,
  createSession,
  enroll,
  newQrToken,
  permanentlyRemoveMember,
  recordAttendance,
  recordDepartmentAttendance,
  registerSelf,
  restoreMember,
  setAltarCall,
  submitReview,
} from "../src/lib/services";

const PORT = 55432;
let server: EmbeddedPostgres;
let dir: string;

const actor = "test@example.org";
const tx = <T,>(fn: (t: Tx) => Promise<T>) => withTx(actor, fn);
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The most recent Sunday strictly before today, so sessions are always in the past. */
function lastSunday(): string {
  const t = today();
  const dow = new Date(`${t}T00:00:00Z`).getUTCDay();
  return shift(t, -(dow === 0 ? 7 : dow));
}
const sundaysAgo = (n: number) => shift(lastSunday(), -7 * n);

async function program(name: string, opts: { sunday?: boolean; counts?: boolean; type?: string } = {}): Promise<string> {
  const row = await tx((t) =>
    t.query(
      `INSERT INTO programs (name, type, counts_toward_streak, is_sunday, qr_token) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, opts.type ?? "regular", opts.counts ?? true, opts.sunday ?? false, newQrToken()],
    ),
  );
  return row.rows[0].id;
}
const person = (name: string, phone?: string) => tx((t) => createPerson(t, { full_name: name, phone })).then((p) => p.id);
const session = (programId: string, date: string) => tx((t) => createSession(t, programId, date)).then((s) => s.id);
const present = (sessionId: string, personId: string, altarCall?: boolean) =>
  tx((t) => recordAttendance(t, { sessionId, personId, present: true, altarCall, method: "admin", recordedBy: actor }));
const stat = (personId: string, programId: string | null) =>
  one(`SELECT * FROM person_program_stats WHERE person_id = $1 AND program_id IS NOT DISTINCT FROM $2::uuid`, [personId, programId]);
const followUps = (personId: string) => query(`SELECT * FROM follow_ups WHERE person_id = $1 ORDER BY created_at`, [personId]);
async function department(name: string): Promise<string> {
  const row = await tx((t) => t.query(`INSERT INTO departments (name, qr_token) VALUES ($1, $2) RETURNING id`, [name, newQrToken()]));
  return row.rows[0].id;
}
/** Joins with a backdated date, so older test sessions count for this member. */
async function member(personId: string, departmentId: string) {
  await tx(async (t) => {
    await t.query(`INSERT INTO department_memberships (person_id, department_id, joined_at) VALUES ($1, $2, now() - interval '200 days')`, [personId, departmentId]);
  });
}
const membership = (personId: string, departmentId: string) =>
  one(`SELECT * FROM department_memberships WHERE person_id = $1 AND department_id = $2 AND (removed_at IS NULL OR status = 'permanently_removed')`, [personId, departmentId]);
const missStreak = async (personId: string, departmentId: string) =>
  (await one(`SELECT miss_streak FROM person_department_stats WHERE person_id = $1 AND department_id = $2`, [personId, departmentId]))?.miss_streak;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cmspg-"));
  server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: true, onLog: () => undefined }); // the temp folder is removed in afterAll
  await server.initialise();
  await server.start();
  await server.createDatabase("cms_test");
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/cms_test`;
  process.env.CHURCH_TIMEZONE = "UTC";
  const sql = readFileSync(join(__dirname, "..", "migrations", "001_schema.sql"), "utf8");
  await tx(async (t) => {
    await t.query(sql);
  });
}, 120_000);

afterAll(async () => {
  await closePool();
  await server?.stop();
  // Windows can hold the folder briefly after shutdown. A leftover temp folder is harmless.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
});

describe("audit and soft delete", () => {
  it("logs every mutation with the actor and before/after", async () => {
    const id = await person("Audit Target");
    await tx((t) => t.query(`UPDATE people SET phone = '123' WHERE id = $1`, [id]));
    const log = await query(`SELECT * FROM audit_log WHERE entity = 'people' AND entity_id = $1 ORDER BY id`, [id]);
    expect(log.map((l) => l.action)).toEqual(["insert", "update"]);
    expect(log[1].actor).toBe(actor);
    expect(log[1].before.phone).toBeNull();
    expect(log[1].after.phone).toBe("123");
  });
  it("refuses hard deletes, and the audit log cannot be changed", async () => {
    const id = await person("No Delete");
    await expect(tx((t) => t.query(`DELETE FROM people WHERE id = $1`, [id]))).rejects.toThrow(/Hard delete/);
    await expect(tx((t) => t.query(`DELETE FROM audit_log`))).rejects.toThrow(/append-only/);
    await expect(tx((t) => t.query(`UPDATE audit_log SET actor = 'x'`))).rejects.toThrow(/append-only/);
  });
  it("never writes password hashes to the audit log", async () => {
    await tx((t) => t.query(`INSERT INTO admins (email, password_hash) VALUES ('a@b.c', 'SECRET')`));
    const log = await one(`SELECT after FROM audit_log WHERE entity = 'admins' ORDER BY id DESC LIMIT 1`);
    expect(JSON.stringify(log!.after)).not.toContain("SECRET");
  });
});

describe("attendance, streak and status", () => {
  it("moves through First Timer, Occasional and Consistent", async () => {
    const prog = await program("Status Program");
    const p = await person("Status Person");
    const ids = [];
    for (const n of [3, 2, 1, 0]) ids.push(await session(prog, sundaysAgo(n)));
    await present(ids[0], p);
    await tx((t) => recomputePeople(t, [p], sundaysAgo(3)));
    expect((await stat(p, prog))!.status_badge).toBe("First Timer");
    await present(ids[1], p);
    await present(ids[2], p);
    await present(ids[3], p);
    const s = await stat(p, prog);
    expect(s!.current_streak).toBe(4);
    expect(s!.status_badge).toBe("Consistent");
  });
  it("special programs count toward the general streak", async () => {
    const regular = await program("General Regular");
    const special = await program("General Special", { type: "special" });
    const p = await person("General Person");
    // Dated long ago and computed as of that day, so other tests' sessions are not in the sequence.
    await present(await session(regular, "2000-01-03"), p);
    await present(await session(special, "2000-01-04"), p);
    await tx((t) => recomputePeople(t, [p], "2000-01-04"));
    expect((await stat(p, null))!.current_streak).toBe(2);
    expect((await stat(p, special))!.current_streak).toBe(1);
  });
  it("a program that does not count leaves the streak at 0", async () => {
    const prog = await program("Not Counting", { counts: false });
    const p = await person("NC Person");
    await present(await session(prog, shift(today(), -1)), p);
    expect((await stat(p, prog))!.current_streak).toBe(0);
  });
});

describe("altar call", () => {
  it("applies the tag and a high-priority follow-up, without duplicates", async () => {
    const prog = await program("Altar Program");
    const p = await person("Altar Person");
    const s1 = await session(prog, shift(today(), -14));
    const s2 = await session(prog, shift(today(), -7));
    await present(s1, p, true);
    await present(s2, p, true);
    const tags = await query(
      `SELECT t.name FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = $1 AND pt.removed_at IS NULL`,
      [p],
    );
    expect(tags.map((t) => t.name)).toEqual(["Altar Call"]);
    const list = (await followUps(p)).filter((f) => f.reason === "altar_call");
    expect(list).toHaveLength(1);
    expect(list[0].priority).toBe("high");
  });
  it("a QR scan never sets or clears altar call", async () => {
    const prog = await program("QR Altar");
    const p = await person("QR Person");
    const s = await session(prog, shift(today(), -1));
    const row = await present(s, p, true);
    await tx((t) => recordAttendance(t, { sessionId: s, personId: p, present: true, method: "qr", recordedBy: "self" }));
    expect((await one(`SELECT altar_call FROM attendance WHERE id = $1`, [row.id]))!.altar_call).toBe(true);
  });
  it("undoing the only altar-call mark removes the tag", async () => {
    const prog = await program("Altar Undo");
    const p = await person("Undo Person");
    const row = await present(await session(prog, shift(today(), -1)), p, true);
    await tx((t) => setAltarCall(t, row.id, false));
    const tags = await query(`SELECT 1 AS x FROM person_tags WHERE person_id = $1 AND removed_at IS NULL`, [p]);
    expect(tags).toHaveLength(0);
  });
});

describe("academy", () => {
  it("only Sunday programs count, 4 consecutive makes Ready, Enroll clears Ready", async () => {
    const sunday = await program("Academy Sunday", { sunday: true });
    const midweek = await program("Academy Midweek");
    const p = await person("Academy Person");
    for (const n of [3, 2, 1]) await present(await session(sunday, sundaysAgo(n)), p);
    for (const n of [1, 2, 3, 4, 5]) await present(await session(midweek, shift(today(), -n)), p);
    const ready = () => one(`SELECT * FROM person_academy_stats WHERE person_id = $1`, [p]);
    expect((await ready())!.ready_since).toBeNull();
    await expect(tx((t) => enroll(t, p))).rejects.toThrow(/4 consecutive/);

    await present(await session(sunday, sundaysAgo(0)), p);
    expect((await ready())!.ready_since).toBe(sundaysAgo(0));

    await tx((t) => enroll(t, p, "Welcome"));
    expect(await one(`SELECT 1 AS x FROM enrollments WHERE person_id = $1`, [p])).toBeTruthy();
    await expect(tx((t) => enroll(t, p))).rejects.toThrow(/already/);
  });
  it("rejects a Sunday-program session on another weekday", async () => {
    const sunday = await program("Sunday Check", { sunday: true });
    await expect(session(sunday, shift(lastSunday(), 1))).rejects.toThrow(/Sunday/);
  });
});

describe("follow-ups and absence alerts", () => {
  it("raises first_timer after X days, once only", async () => {
    const prog = await program("FT Program");
    const p = await person("FT Person");
    await present(await session(prog, shift(today(), -10)), p);
    await tx((t) => recomputePeople(t, [p]));
    await tx((t) => recomputePeople(t, [p]));
    const list = (await followUps(p)).filter((f) => f.reason === "first_timer");
    expect(list).toHaveLength(1);
    expect(list[0].priority).toBe("normal");
  });
  it("raises nothing yet before X days", async () => {
    const prog = await program("FT Recent");
    const p = await person("FT Recent Person");
    await present(await session(prog, shift(today(), -3)), p);
    expect(await followUps(p)).toHaveLength(0);
  });
  it("consistent then 2 misses: absence alert and follow-up, resolved on return", async () => {
    const prog = await program("Absence Program");
    const p = await person("Absence Person");
    for (const n of [8, 7, 6, 5]) await present(await session(prog, sundaysAgo(n)), p);
    const s6 = await session(prog, sundaysAgo(4));
    await session(prog, sundaysAgo(3));
    await tx((t) => recomputePeople(t, [p]));
    const alerts = () => query(`SELECT * FROM absence_alerts WHERE person_id = $1 AND program_id = $2`, [p, prog]);
    expect(await alerts()).toHaveLength(1);
    expect((await followUps(p)).filter((f) => f.reason === "absence")).toHaveLength(1);
    await tx((t) => recomputePeople(t, [p]));
    expect(await alerts()).toHaveLength(1);
    await present(s6, p);
    const late = await session(prog, sundaysAgo(2));
    await present(late, p);
    const after = await session(prog, sundaysAgo(1));
    await present(after, p);
    expect((await alerts())[0].resolved).toBe(true);
  });
  it("consistent then N misses: Dropped Off and a follow-up", async () => {
    const prog = await program("Drop Program");
    const p = await person("Drop Person");
    for (const n of [9, 8, 7, 6]) await present(await session(prog, sundaysAgo(n)), p);
    for (const n of [5, 4, 3, 2]) await session(prog, sundaysAgo(n));
    await tx((t) => recomputePeople(t, [p]));
    expect((await stat(p, prog))!.status_badge).toBe("Dropped Off");
    expect((await followUps(p)).filter((f) => f.reason === "drop_off")).toHaveLength(1);
  });
});

describe("department state machine", () => {
  it("no scan on two services moves to Waiting Corner, restore keeps history, removal is final", async () => {
    const prog = await program("Dept Program");
    const dept = await department("State Dept");
    const p = await person("Dept Person");
    await member(p, dept);
    const s: string[] = [];
    for (const n of [12, 11, 10, 9, 8]) s.push(await session(prog, sundaysAgo(n)));

    await tx((t) => closeOutSession(t, s[0], dept));
    expect(await missStreak(p, dept)).toBe(1);
    expect((await membership(p, dept))!.status).toBe("active");

    await tx((t) => closeOutSession(t, s[1], dept));
    expect(await missStreak(p, dept)).toBe(2);
    expect((await membership(p, dept))!.status).toBe("waiting_corner");
    const events = () => query(`SELECT * FROM department_events WHERE person_id = $1 ORDER BY occurred_at`, [p]);
    expect(await events()).toHaveLength(1);
    expect((await events())[0].miss_count_at_event).toBe(2);

    await tx((t) => restoreMember(t, dept, p));
    expect((await membership(p, dept))!.status).toBe("active");
    expect(await missStreak(p, dept)).toBe(0);
    expect((await events()).map((e) => e.event_type)).toEqual(["entered_waiting_corner", "restored"]);

    await expect(tx((t) => permanentlyRemoveMember(t, dept, p))).rejects.toThrow(/only allowed from the Waiting Corner/);
  });

  it("re-enters after restore, then permanent removal is irreversible", async () => {
    const dept = await department("Remove Dept");
    const prog = await program("Remove Program");
    const p = await person("Remove Person");
    await member(p, dept);
    const s: string[] = [];
    for (const n of [12, 11]) s.push(await session(prog, sundaysAgo(n)));
    for (const id of s) await tx((t) => closeOutSession(t, id, dept));
    await tx((t) => restoreMember(t, dept, p));
    // Recorded after the restore, so these count from zero.
    const secondProgram = await program("Remove Program Two");
    const later = [await session(prog, today()), await session(secondProgram, today())];
    await tx((t) => closeOutSession(t, later[0], dept));
    expect(await missStreak(p, dept)).toBe(1);
    await tx((t) => closeOutSession(t, later[1], dept));
    expect((await membership(p, dept))!.status).toBe("waiting_corner");

    await tx((t) => permanentlyRemoveMember(t, dept, p, "Agreed with pastor"));
    expect((await membership(p, dept))!.status).toBe("permanently_removed");
    await expect(tx((t) => restoreMember(t, dept, p))).rejects.toThrow(/Only someone in the Waiting Corner/);
    await expect(tx((t) => t.query(`UPDATE department_memberships SET status = 'active', removed_at = NULL WHERE person_id = $1`, [p]))).rejects.toThrow(/irreversible/);
    await expect(tx((t) => assignDepartment(t, p, dept))).rejects.toThrow(/cannot be undone/);
    const history = await query(`SELECT event_type FROM department_events WHERE person_id = $1`, [p]);
    expect(history.length).toBeGreaterThanOrEqual(4);
  });

  it("a scan resets the counter and has no effect on anyone else", async () => {
    const prog = await program("Reset Program");
    const dept = await department("Reset Dept");
    const a = await person("Reset A");
    const b = await person("Reset B");
    await member(a, dept);
    await member(b, dept);
    const s1 = await session(prog, sundaysAgo(12));
    const s2 = await session(prog, sundaysAgo(11));
    await tx((t) => closeOutSession(t, s1, dept));
    await tx((t) => recordDepartmentAttendance(t, { sessionId: s2, personId: a, departmentId: dept, present: true, method: "qr" }));
    await tx((t) => recordDepartmentAttendance(t, { sessionId: s2, personId: b, departmentId: dept, present: false, method: "admin" }));
    expect(await missStreak(a, dept)).toBe(0);
    expect((await membership(a, dept))!.status).toBe("active");
    expect((await membership(b, dept))!.status).toBe("waiting_corner");
  });

  it("allows exactly one department per person, and blocks moving someone in the Waiting Corner", async () => {
    const d1 = await department("One A");
    const d2 = await department("One B");
    const p = await person("One Dept");
    await member(p, d1);
    await expect(member(p, d2)).rejects.toThrow(/one_department_per_person/);
    await tx((t) => assignDepartment(t, p, d2));
    expect((await query(`SELECT 1 AS x FROM department_memberships WHERE person_id = $1 AND removed_at IS NULL`, [p]))).toHaveLength(1);
    await tx((t) => t.query(`UPDATE department_memberships SET status = 'waiting_corner' WHERE person_id = $1 AND removed_at IS NULL`, [p]));
    await expect(tx((t) => assignDepartment(t, p, d1))).rejects.toThrow(/Waiting Corner/);
  });

  it("general attendance does not count as department attendance", async () => {
    const prog = await program("Separate Program");
    const dept = await department("Separate Dept");
    const p = await person("Separate Person");
    await member(p, dept);
    const s = await session(prog, sundaysAgo(12));
    await present(s, p);
    await tx((t) => closeOutSession(t, s, dept));
    expect(await missStreak(p, dept)).toBe(1);
  });

  it("does not count services from before someone joined", async () => {
    const prog = await program("Join Program");
    const dept = await department("Join Dept");
    const s = await session(prog, sundaysAgo(12));
    const p = await person("New Joiner");
    await tx((t) => assignDepartment(t, p, dept));
    await tx((t) => closeOutSession(t, s, dept));
    expect(await missStreak(p, dept)).toBeUndefined();
  });
});

describe("service reviews", () => {
  it("creates pending reviews, and rejects any review missing a member note", async () => {
    const prog = await program("Review Program");
    const dept = await department("Review Dept");
    const a = await person("Review A");
    const b = await person("Review B");
    await member(a, dept);
    await member(b, dept);
    const earlier = await session(prog, shift(today(), -1));
    const s = await session(prog, today());
    const reviewFor = (sessionId: string) =>
      one(`SELECT status FROM service_reviews WHERE department_id = $1 AND session_id = $2`, [dept, sessionId]);
    expect((await reviewFor(s))!.status).toBe("pending");
    // The department was created today, so it owes nothing for yesterday.
    expect(await reviewFor(earlier)).toBeNull();

    const base = { department_id: dept, session_id: s, summary: "Went well" };
    await expect(tx((t) => submitReview(t, { ...base, notes: [{ person_id: a, note: "Good" }] }))).rejects.toThrow(/Review B/);
    await expect(tx((t) => submitReview(t, { ...base, notes: [{ person_id: a, note: "Good" }, { person_id: b, note: "   " }] }))).rejects.toThrow(/Review B/);

    await tx((t) => submitReview(t, { ...base, notes: [{ person_id: a, note: "Good" }, { person_id: b, note: "Late" }] }));
    const done = await one(`SELECT id, status FROM service_reviews WHERE department_id = $1 AND session_id = $2`, [dept, s]);
    expect(done!.status).toBe("submitted");
    expect(await query(`SELECT 1 AS x FROM member_notes WHERE review_id = $1`, [done!.id])).toHaveLength(2);
  });
});

describe("duplicate detection on self-registration", () => {
  it("same phone and name is the same person; partial matches are flagged, not merged", async () => {
    const original = await tx((t) => registerSelf(t, { full_name: "Ada  Obi", phone: "0801-234-5678" }));
    const same = await tx((t) => registerSelf(t, { full_name: "ada obi", phone: "08012345678" }));
    expect(same).toBe(original);
    const relative = await tx((t) => registerSelf(t, { full_name: "Chidi Obi", phone: "08012345678" }));
    expect(relative).not.toBe(original);
    const flag = await one(`SELECT * FROM possible_duplicates WHERE person_id = $1`, [relative]);
    expect(flag!.matched_on).toBe("phone");
    const namesake = await tx((t) => registerSelf(t, { full_name: "Ada Obi", phone: "09099999999" }));
    expect((await one(`SELECT * FROM possible_duplicates WHERE person_id = $1`, [namesake]))!.matched_on).toBe("name");
  });
});

describe("monthly attendance report", () => {
  it("lists each service's own number and compares the monthly averages", async () => {
    const prog = await program("Monthly Program");
    const people = [];
    for (let i = 0; i < 6; i++) people.push(await person(`Monthly Person ${i}`));
    const mark = async (date: string, who: string[]) => {
      const s = await session(prog, date);
      for (const id of who) await present(s, id);
    };
    await mark("2021-02-03", people.slice(0, 2)); // February: 2
    await mark("2021-03-03", people.slice(0, 4)); // March: 4
    await mark("2021-03-10", people.slice(2, 4)); // March: 2, the same two people again
    const r = await monthlyAttendance("2021-03", prog);
    expect(r.services.map((s) => s.present)).toEqual([4, 2]);
    expect(r.services.map((s) => s.change)).toEqual([null, -2]);
    expect(r.summary.average).toBe(3);
    expect(r.uniquePeople).toBe(4);
    expect(r.comparison).toEqual({ net: 1, percent: 50 });
    expect(r.previous.average).toBe(2);
  });
  it("defaults to the last complete month and rejects bad or future months", async () => {
    const thisMonth = today().slice(0, 7);
    const last = await monthlyAttendance();
    expect(last.month < thisMonth).toBe(true);
    expect(last.inProgress).toBe(false);
    expect((await monthlyAttendance("9999-01")).month).toBe(last.month);
    expect((await monthlyAttendance("not-a-month")).month).toBe(last.month);
    expect((await monthlyAttendance(thisMonth)).inProgress).toBe(true);
  });
});

describe("people who stop coming stay in Follow-Ups", () => {
  const open = async (id: string) => (await followUps(id)).filter((f) => f.status === "open");

  it("adds someone after one missed service, keeps one card, and closes it when they return", async () => {
    const prog = await program("Care Program");
    const p = await person("Care Person");
    await present(await session(prog, shift(today(), -21)), p);
    await present(await session(prog, shift(today(), -20)), p);
    await session(prog, shift(today(), -14));
    await tx((t) => recomputePeople(t, [p]));
    expect((await open(p)).map((f) => f.reason)).toEqual(["absence"]);
    await tx((t) => recomputePeople(t, [p]));
    expect(await open(p)).toHaveLength(1);
    await present(await session(prog, today()), p);
    expect(await open(p)).toHaveLength(0);
    expect((await followUps(p)).every((f) => f.status === "done")).toBe(true);
  });
  it("comes back if they stop again", async () => {
    const prog = await program("Care Again");
    const p = await person("Care Again Person");
    await present(await session(prog, shift(today(), -30)), p);
    await present(await session(prog, shift(today(), -29)), p);
    await session(prog, shift(today(), -21));
    await present(await session(prog, shift(today(), -14)), p);
    await session(prog, shift(today(), -7));
    await tx((t) => recomputePeople(t, [p]));
    expect((await open(p)).map((f) => f.reason)).toEqual(["absence"]);
  });
  it("is not added for missing a program they never attend", async () => {
    const sunday = await program("Care Sunday");
    const midweek = await program("Care Midweek");
    const p = await person("Sunday Only");
    await session(midweek, shift(today(), -2));
    await present(await session(sunday, shift(today(), -3)), p);
    await tx((t) => recomputePeople(t, [p]));
    expect(await open(p)).toHaveLength(0);
  });
  it("is not added while they still come to another service they attend", async () => {
    const sunday = await program("Care Both Sunday");
    const midweek = await program("Care Both Midweek");
    const p = await person("Both Services");
    await present(await session(sunday, shift(today(), -9)), p);
    await present(await session(midweek, shift(today(), -8)), p);
    await session(sunday, shift(today(), -2));
    await present(await session(midweek, shift(today(), -1)), p);
    await tx((t) => recomputePeople(t, [p]));
    expect(await open(p)).toHaveLength(0);
  });
  it("relabels one card rather than stacking cards when someone drops off", async () => {
    const prog = await program("Care Drop");
    const p = await person("Care Drop Person");
    for (const n of [9, 8, 7, 6]) await present(await session(prog, sundaysAgo(n)), p);
    await session(prog, sundaysAgo(5));
    await tx((t) => recomputePeople(t, [p]));
    expect((await open(p)).map((f) => f.reason)).toEqual(["absence"]);
    for (const n of [4, 3, 2]) await session(prog, sundaysAgo(n));
    await tx((t) => recomputePeople(t, [p]));
    expect((await open(p)).map((f) => f.reason)).toEqual(["drop_off"]);
  });
  it("leaves altar-call follow-ups open when someone returns", async () => {
    const prog = await program("Care Altar");
    const p = await person("Care Altar Person");
    await present(await session(prog, shift(today(), -21)), p, true);
    await session(prog, shift(today(), -14));
    await tx((t) => recomputePeople(t, [p]));
    await present(await session(prog, today()), p);
    expect((await open(p)).map((f) => f.reason)).toEqual(["altar_call"]);
  });
  it("never adds an archived person", async () => {
    const prog = await program("Care Archived");
    const p = await person("Care Archived Person");
    await present(await session(prog, shift(today(), -5)), p);
    await session(prog, shift(today(), -3));
    await tx((t) => t.query(`UPDATE people SET status = 'archived' WHERE id = $1`, [p]));
    await tx((t) => recomputePeople(t, [p]));
    expect(await open(p)).toHaveLength(0);
  });
});

describe("daily job", () => {
  it("closes past services once and is safe to repeat", async () => {
    const prog = await program("Daily Program");
    const dept = await department("Daily Dept");
    const p = await person("Daily Person");
    await member(p, dept);
    await session(prog, sundaysAgo(14));
    await session(prog, sundaysAgo(13));
    await tx((t) => runDaily(t));
    expect((await membership(p, dept))!.status).toBe("waiting_corner");
    const count = () => query(`SELECT 1 AS x FROM department_events WHERE person_id = $1`, [p]);
    expect(await count()).toHaveLength(1);
    await tx((t) => runDaily(t));
    expect(await count()).toHaveLength(1);
  });
});
