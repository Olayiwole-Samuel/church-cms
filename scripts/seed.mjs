// Creates the admin login plus sample programs and departments. Safe to run twice.
// Add --demo for sample people and attendance so every screen has something to show.
import { randomBytes } from "node:crypto";
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const url = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!url || !email || !password) {
  console.error("DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD must be set.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("ADMIN_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
});
const token = () => randomBytes(18).toString("base64url");
pg.types.setTypeParser(1082, (v) => v);

await client.connect();
await client.query("BEGIN");
await client.query("SELECT set_config('app.actor', 'seed', true)");
try {
  const hash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash],
  );

  const programs = [
    ["Sunday Service", "regular", true, true],
    ["Midweek Service", "regular", true, false],
    ["Annual Conference", "special", true, false],
  ];
  for (const [name, type, counts, isSunday] of programs) {
    await client.query(
      `INSERT INTO programs (name, type, counts_toward_streak, is_sunday, qr_token)
       SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = $1)`,
      [name, type, counts, isSunday, token()],
    );
  }
  for (const name of ["Choir", "Ushering", "Media", "Children's Ministry", "Protocol"]) {
    await client.query(
      `INSERT INTO departments (name, qr_token)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name = $1)`,
      [name, token()],
    );
  }

  if (process.argv.includes("--demo")) await seedDemo();

  await client.query("COMMIT");
  console.log(`Seed complete. Admin login: ${email}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

// Sample data only. Attendance rows are inserted directly; the app's daily job
// (or any new mark) then computes streaks, statuses and follow-ups from them.
async function seedDemo() {
  const { rows: existing } = await client.query("SELECT count(*)::int AS n FROM people");
  if (existing[0].n > 0) {
    console.log("People already exist, skipping demo data.");
    return;
  }
  const names = [
    "Grace Mensah", "Daniel Okafor", "Ruth Adeyemi", "Samuel Boateng", "Esther Nwosu", "Joshua Tetteh",
    "Mary Chukwu", "Peter Asante", "Lydia Owusu", "David Eze", "Hannah Bello", "Caleb Darko",
  ];
  const people = [];
  for (const [i, full_name] of names.entries()) {
    const { rows } = await client.query(
      `INSERT INTO people (full_name, phone, source) VALUES ($1, $2, 'demo') RETURNING id`,
      [full_name, `0800000${String(i).padStart(4, "0")}`],
    );
    people.push(rows[0].id);
  }

  const { rows: sunday } = await client.query("SELECT id FROM programs WHERE name = 'Sunday Service'");
  const now = new Date();
  const lastSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay() - 7));
  const sessions = [];
  for (let weeksAgo = 7; weeksAgo >= 0; weeksAgo--) {
    const date = new Date(lastSunday.getTime() - weeksAgo * 7 * 86_400_000).toISOString().slice(0, 10);
    const { rows } = await client.query(
      `INSERT INTO sessions (program_id, date) VALUES ($1, $2) RETURNING id, date`,
      [sunday[0].id, date],
    );
    sessions.push(rows[0]);
  }

  // Index = which of the 8 Sundays (oldest first) each person attended.
  const patterns = [
    [0, 1, 2, 3, 4, 5, 6, 7], // consistent
    [4, 5, 6, 7], // ready for academy
    [0, 1, 2, 3, 4, 5], // consistent, then missed two: absence alert
    [0, 1, 2, 3], // dropped off
    [0], // never returned
    [7], // first timer
    [1, 3, 5, 7], // occasional
    [2, 4, 6], // occasional
    [3, 4, 5, 6, 7], // consistent
    [6, 7], // occasional
    [7], // first timer
    [0, 2], // occasional
  ];
  for (const [i, personId] of people.entries()) {
    for (const index of patterns[i]) {
      await client.query(
        `INSERT INTO attendance (session_id, person_id, present, altar_call, recorded_by, method)
         VALUES ($1, $2, true, $3, 'seed', 'admin')`,
        [sessions[index].id, personId, i === 1 && index === 4],
      );
    }
    await client.query("UPDATE people SET first_visit_date = $2 WHERE id = $1", [personId, sessions[patterns[i][0]].date]);
  }

  // Altar Call tag for the person with the altar-call mark.
  await client.query(
    `INSERT INTO person_tags (person_id, tag_id) SELECT $1, id FROM tags WHERE name = 'Altar Call'`,
    [people[1]],
  );
  await client.query(`INSERT INTO follow_ups (person_id, reason, priority) VALUES ($1, 'altar_call', 'high')`, [people[1]]);

  const { rows: departments } = await client.query("SELECT id, name FROM departments ORDER BY name");
  for (const [i, personId] of people.slice(0, 8).entries()) {
    await client.query(
      `INSERT INTO department_memberships (person_id, department_id, joined_at) VALUES ($1, $2, $3)`,
      [personId, departments[i % departments.length].id, `${sessions[6].date}T00:00:00Z`],
    );
  }
  // Marks the two most recent Sundays for department members, except that the first
  // member has no scans. The daily job will count those as misses.
  for (const session of sessions.slice(6)) {
    const { rows: members } = await client.query("SELECT person_id, department_id FROM department_memberships");
    for (const [i, m] of members.entries()) {
      if (i === 0) continue;
      await client.query(
        `INSERT INTO department_attendance (session_id, person_id, department_id, present, method)
         VALUES ($1, $2, $3, true, 'admin')`,
        [session.id, m.person_id, m.department_id],
      );
    }
  }
  console.log("Demo data added. Run the daily job (see README) to compute statuses.");
}
