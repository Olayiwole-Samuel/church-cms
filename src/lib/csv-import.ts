// CSV import for people. Pure functions only, so the browser and the server share them,
// and every rule can be unit tested. See tests/csv-import.test.ts.

export const MAX_IMPORT_ROWS = 5000;

/** Reads CSV text: quoted fields, doubled quotes, line breaks inside quotes, and a BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Comma, semicolon (Excel in many locales) or tab, judged from the header line. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => firstLine.split(d).length - 1;
  return [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
}

export const IMPORT_FIELDS = [
  { key: "full_name", label: "Full name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gender", label: "Gender" },
  { key: "address", label: "Address" },
  { key: "first_visit_date", label: "First visit date" },
  { key: "department", label: "Department" },
  { key: "tags", label: "Tags" },
  { key: "source", label: "Source" },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

const SYNONYMS: Record<ImportField, string[]> = {
  full_name: ["name", "fullname", "names", "membername", "fullnames", "nameofmember"],
  first_name: ["firstname", "first", "givenname", "forename"],
  last_name: ["lastname", "surname", "familyname", "last"],
  phone: ["phone", "phonenumber", "phoneno", "mobile", "mobilenumber", "mobileno", "telephone", "tel", "whatsapp", "whatsappnumber", "contact", "contactnumber", "gsm", "cell", "cellphone"],
  email: ["email", "emailaddress", "mail", "emailid"],
  gender: ["gender", "sex"],
  address: ["address", "homeaddress", "residentialaddress", "residence", "location"],
  first_visit_date: ["firstvisit", "firstvisitdate", "datejoined", "joined", "joindate", "datefirstvisited", "firstattended", "datefirstattended"],
  department: ["department", "dept", "unit", "ministry", "workforce", "serviceunit"],
  tags: ["tags", "tag", "labels", "label"],
  source: ["source", "howdidyouhear", "howdidyouhearaboutus", "referral", "invitedby"],
};

/** Matches a column heading such as "Phone Number" or "E-mail" to a field. */
export function guessField(header: string): ImportField | null {
  const key = header.toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;
  for (const [field, words] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
    if (words.includes(key)) return field;
  }
  return null;
}

/** One guess per field: if two columns look like "phone", only the first is used. */
export function guessMapping(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return headers.map((h) => {
    const field = guessField(h);
    if (!field || used.has(field)) return null;
    used.add(field);
    return field;
  });
}

export interface ImportRow {
  /** The row number as a spreadsheet shows it: the heading is row 1. */
  row: number;
  full_name: string;
  phone?: string;
  email?: string;
  gender?: string;
  address?: string;
  first_visit_date?: string;
  department?: string;
  tags?: string[];
  source?: string;
}

/** Turns spreadsheet rows into people, joining first and last names when there is no full name. */
export function buildRows(table: string[][], mapping: (ImportField | null)[]): ImportRow[] {
  return table.slice(1).map((cells, i) => {
    const get = (field: ImportField) => {
      const index = mapping.indexOf(field);
      return index < 0 ? "" : (cells[index] ?? "").trim();
    };
    const fullName = get("full_name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ");
    const tags = get("tags")
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const row: ImportRow = { row: i + 2, full_name: fullName.replace(/\s+/g, " ") };
    for (const field of ["phone", "email", "gender", "address", "first_visit_date", "department", "source"] as const) {
      const value = get(field);
      if (value) row[field] = value;
    }
    if (tags.length) row.tags = tags;
    return row;
  });
}

/**
 * Accepts 2026-03-15, 2026/03/15, and day-first 15/03/2026 or 15-03-26, as written in
 * Nigeria and the UK. Returns YYYY-MM-DD, or null for anything else or any future date.
 */
export function parseImportDate(value: string, today: string): string | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += y > Number(today.slice(2, 4)) ? 1900 : 2000;
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const iso = date.toISOString().slice(0, 10);
  return iso > today ? null : iso;
}

export function normalizeGender(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (["m", "male", "man", "boy"].includes(v)) return "male";
  if (["f", "female", "woman", "girl"].includes(v)) return "female";
  return null;
}

/**
 * Compares phone numbers by their last 10 digits, so 08031234567, +2348031234567 and
 * 8031234567 (Excel drops the leading zero) all count as the same number.
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const nameKey = (name: string | null | undefined) => (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
/** Excel turns long numbers into 8.03E+09, which cannot be turned back into the real number. */
const isScientific = (v: string) => /^\d+(\.\d+)?e\+?\d+$/i.test(v.trim());

export interface ExistingPerson {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface PlannedPerson {
  row: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  address: string | null;
  first_visit_date: string | null;
  source: string;
  departmentId: string | null;
  departmentName: string | null;
  tags: string[];
  /** Existing people with the same phone or the same name, for the admin to review. */
  possibleDuplicates: { personId: string; on: "phone" | "name" }[];
}

export interface ImportPlan {
  toCreate: PlannedPerson[];
  skipped: { row: number; name: string; reason: string }[];
  warnings: { row: number; message: string }[];
}

/**
 * Decides what an import will do, before anything is written.
 * - Same phone and same name as someone already here, or earlier in the file: skipped.
 * - No phone on either side and the same name: also skipped, so importing a file twice is safe.
 * - Same phone or same name alone: added, and flagged as a possible duplicate, because it
 *   may be a relative sharing a phone, or a namesake. This matches self-registration.
 * - Anything unreadable in a column is dropped with a warning. Only a missing name skips a row.
 */
export function planImport(
  rows: ImportRow[],
  ctx: { existing: ExistingPerson[]; departments: { id: string; name: string }[]; tags: string[]; today: string },
): ImportPlan {
  const plan: ImportPlan = { toCreate: [], skipped: [], warnings: [] };
  const departments = new Map(ctx.departments.map((d) => [nameKey(d.name), d]));
  const tags = new Map(ctx.tags.map((t) => [nameKey(t), t]));
  const seen = new Map<string, number>();
  const key = (name: string, phone: string) => `${nameKey(name)}|${phoneKey(phone)}`;
  for (const p of ctx.existing) seen.set(key(p.full_name, p.phone ?? ""), 0);

  for (const r of rows) {
    const warn = (message: string) => plan.warnings.push({ row: r.row, message });
    const name = r.full_name.trim().replace(/\s+/g, " ");
    if (!name) {
      plan.skipped.push({ row: r.row, name: "", reason: "No name" });
      continue;
    }
    if (name.length > 200) {
      plan.skipped.push({ row: r.row, name: name.slice(0, 40), reason: "Name is too long" });
      continue;
    }

    let phone = (r.phone ?? "").trim();
    if (phone && isScientific(phone)) {
      warn(`Phone "${phone}" was changed by Excel and can't be read, so it was left out. Format the column as Text and export again.`);
      phone = "";
    } else if (phone && phoneKey(phone).length < 7) {
      warn(`Phone "${phone}" is too short, so it was left out.`);
      phone = "";
    }

    const k = key(name, phone);
    const earlier = seen.get(k);
    if (earlier !== undefined) {
      plan.skipped.push({ row: r.row, name, reason: earlier === 0 ? "Already in the system" : `Same person as row ${earlier}` });
      continue;
    }
    seen.set(k, r.row);

    let email = (r.email ?? "").trim() || null;
    if (email && !isEmail(email)) {
      warn(`Email "${email}" doesn't look right, so it was left out.`);
      email = null;
    }
    let gender: string | null = null;
    if (r.gender) {
      gender = normalizeGender(r.gender);
      if (!gender) warn(`Gender "${r.gender}" isn't Male or Female, so it was left out.`);
    }
    let firstVisit: string | null = null;
    if (r.first_visit_date) {
      firstVisit = parseImportDate(r.first_visit_date, ctx.today);
      if (!firstVisit) warn(`Date "${r.first_visit_date}" can't be read, or is in the future, so it was left out. Use 2026-03-15 or 15/03/2026.`);
    }
    let department: { id: string; name: string } | null = null;
    if (r.department) {
      department = departments.get(nameKey(r.department)) ?? null;
      if (!department) warn(`No department called "${r.department}", so they were not added to one. Create it first, then import again or assign them by hand.`);
    }
    const tagNames: string[] = [];
    for (const t of r.tags ?? []) {
      const tag = tags.get(nameKey(t));
      if (tag) {
        if (!tagNames.includes(tag)) tagNames.push(tag);
      } else warn(`No tag called "${t}", so it was left out.`);
    }

    const possibleDuplicates: PlannedPerson["possibleDuplicates"] = [];
    for (const p of ctx.existing) {
      if (possibleDuplicates.length >= 5) break;
      const samePhone = phone !== "" && phoneKey(p.phone) === phoneKey(phone);
      const sameName = nameKey(p.full_name) === nameKey(name);
      if (samePhone || sameName) possibleDuplicates.push({ personId: p.id, on: samePhone ? "phone" : "name" });
    }

    plan.toCreate.push({
      row: r.row,
      full_name: name,
      phone: phone || null,
      email,
      gender,
      address: (r.address ?? "").trim().slice(0, 500) || null,
      first_visit_date: firstVisit,
      source: (r.source ?? "").trim().slice(0, 200) || "CSV import",
      departmentId: department?.id ?? null,
      departmentName: department?.name ?? null,
      tags: tagNames,
      possibleDuplicates,
    });
  }
  return plan;
}
