// CSV import against a real, throwaway Postgres with the real migrations.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRows, guessMapping, parseCsv } from "../src/lib/csv-import";
import { closePool, one, query, withTx } from "../src/lib/db";
import { importPeople } from "../src/lib/people-import";

const PORT = 55433;
let server: EmbeddedPostgres;
let dir: string;

const rows = (csv: string) => {
  const table = parseCsv(csv);
  return buildRows(table, guessMapping(table[0]));
};
const run = (csv: string, dryRun: boolean) => withTx("admin@test (CSV import)", (tx) => importPeople(tx, rows(csv), dryRun));
const count = async (sql: string) => (await one<{ n: number }>(sql))!.n;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cmsimport-"));
  server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: PORT, persistent: true, onLog: () => undefined });
  await server.initialise();
  await server.start();
  await server.createDatabase("cms_import_test");
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/cms_import_test`;
  process.env.CHURCH_TIMEZONE = "UTC";
  const migrations = join(__dirname, "..", "migrations");
  await withTx("test", async (tx) => {
    for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
      await tx.query(readFileSync(join(migrations, file), "utf8"));
    }
    await tx.query(`INSERT INTO departments (name, qr_token) VALUES ('Choir', 'tok-choir')`);
    await tx.query(`INSERT INTO people (full_name, phone) VALUES ('Existing Person', '08030000001')`);
  });
}, 120_000);

afterAll(async () => {
  await closePool();
  await server?.stop();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
});

const FILE = [
  "Full Name,Phone Number,Email,Sex,Unit,Tags,Date Joined",
  "Grace Adebayo,08031234567,grace@example.com,Female,Choir,Member,15/03/2026",
  "Samuel Okoro,+234 809 988 7766,,M,,,",
  "Existing Person,08030000001,,,,,",
  "Relative Sharing,08030000001,,,,,",
  ",08000000000,,,,,",
  "Grace Adebayo,08031234567,,,,,",
].join("\n");

describe("CSV import", () => {
  it("a check writes nothing", async () => {
    const before = await count(`SELECT count(*)::int AS n FROM people`);
    const result = await run(FILE, true);
    expect(result).toMatchObject({ dryRun: true, added: 3, addedToDepartments: 1, flaggedAsPossibleDuplicates: 1, tagsApplied: 1 });
    expect(await count(`SELECT count(*)::int AS n FROM people`)).toBe(before);
  });

  it("imports people with their details, department, tag and duplicate flags, and audits each one", async () => {
    const result = await run(FILE, false);
    expect(result.added).toBe(3);
    expect(result.skipped.map((s) => s.reason)).toEqual(["Already in the system", "No name", "Same person as row 2"]);

    const grace = await one(`SELECT * FROM people WHERE full_name = 'Grace Adebayo'`);
    expect(grace).toMatchObject({ phone: "08031234567", email: "grace@example.com", gender: "female", first_visit_date: "2026-03-15", source: "CSV import", status: "active" });
    const membership = await one(
      `SELECT d.name, m.status FROM department_memberships m JOIN departments d ON d.id = m.department_id WHERE m.person_id = $1`,
      [grace!.id],
    );
    expect(membership).toEqual({ name: "Choir", status: "active" });
    const tags = await query(`SELECT t.name FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = $1`, [grace!.id]);
    expect(tags.map((t) => t.name)).toEqual(["Member"]);

    const flag = await one(
      `SELECT pd.matched_on FROM possible_duplicates pd JOIN people p ON p.id = pd.person_id WHERE p.full_name = 'Relative Sharing'`,
    );
    expect(flag!.matched_on).toBe("phone");

    const audited = await count(`SELECT count(*)::int AS n FROM audit_log WHERE entity = 'people' AND action = 'insert' AND actor = 'admin@test (CSV import)'`);
    expect(audited).toBe(3);
  });

  it("importing the same file again adds nobody", async () => {
    const before = await count(`SELECT count(*)::int AS n FROM people`);
    const result = await run(FILE, false);
    expect(result.added).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM people`)).toBe(before);
  });

  it("does not re-create someone who was archived", async () => {
    await withTx("test", (tx) => tx.query(`UPDATE people SET status = 'archived' WHERE full_name = 'Samuel Okoro'`));
    const result = await run("Name,Phone\nSamuel Okoro,08099887766", false);
    expect(result.added).toBe(0);
    expect(result.skipped[0].reason).toBe("Already in the system");
  });

  it("rolls back the whole import if any row fails, so a file never half-imports", async () => {
    const before = await count(`SELECT count(*)::int AS n FROM people`);
    await expect(
      withTx("test", async (tx) => {
        await importPeople(tx, rows("Name\nHalf Way One\nHalf Way Two"), false);
        throw new Error("simulated failure");
      }),
    ).rejects.toThrow("simulated failure");
    expect(await count(`SELECT count(*)::int AS n FROM people`)).toBe(before);
  });
});
