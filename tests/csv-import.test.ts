import { describe, expect, it } from "vitest";
import { buildRows, guessMapping, parseCsv, parseImportDate, phoneKey, planImport } from "../src/lib/csv-import";

const TODAY = "2026-11-12";
const ctx = (existing: { id: string; full_name: string; phone: string | null }[] = []) => ({
  existing,
  departments: [{ id: "d-choir", name: "Choir" }],
  tags: ["Member", "Altar Call"],
  today: TODAY,
});
const rowsFrom = (csv: string) => {
  const table = parseCsv(csv);
  return buildRows(table, guessMapping(table[0]));
};

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and line breaks inside quotes, CRLF and a BOM", () => {
    const text = '﻿Name,Address\r\n"Okoro, Samuel","12 ""New"" Road\nLagos"\r\nGrace,\r\n\r\n';
    expect(parseCsv(text)).toEqual([["Name", "Address"], ["Okoro, Samuel", '12 "New" Road\nLagos'], ["Grace", ""]]);
  });
  it("reads semicolon files from Excel in other locales, and tab-separated files", () => {
    expect(parseCsv("Name;Phone\nAda;0803")).toEqual([["Name", "Phone"], ["Ada", "0803"]]);
    expect(parseCsv("Name\tPhone\nAda\t0803")).toEqual([["Name", "Phone"], ["Ada", "0803"]]);
  });
});

describe("column matching", () => {
  it("recognises common headings", () => {
    expect(guessMapping(["Full Name", "Phone Number", "E-mail", "Sex", "Home Address", "Date Joined", "Unit", "Tags"])).toEqual([
      "full_name", "phone", "email", "gender", "address", "first_visit_date", "department", "tags",
    ]);
    expect(guessMapping(["First Name", "Surname", "WhatsApp", "Notes"])).toEqual(["first_name", "last_name", "phone", null]);
  });
  it("uses only the first of two similar columns", () => {
    expect(guessMapping(["Phone", "Mobile"])).toEqual(["phone", null]);
  });
  it("joins first and last names, and splits tags", () => {
    expect(rowsFrom("First Name,Last Name,Tags\nAda,Obi,Member; Altar Call")).toEqual([
      { row: 2, full_name: "Ada Obi", tags: ["Member", "Altar Call"] },
    ]);
  });
});

describe("values", () => {
  it("reads ISO and day-first dates, and rejects impossible or future ones", () => {
    expect(parseImportDate("2026-03-15", TODAY)).toBe("2026-03-15");
    expect(parseImportDate("15/03/2026", TODAY)).toBe("2026-03-15");
    expect(parseImportDate("5-1-26", TODAY)).toBe("2026-01-05");
    expect(parseImportDate("31/02/2026", TODAY)).toBeNull();
    expect(parseImportDate("01/12/2026", TODAY)).toBeNull();
    expect(parseImportDate("March 3", TODAY)).toBeNull();
  });
  it("treats local, international and zero-dropped phone numbers as the same", () => {
    expect(phoneKey("0803 123 4567")).toBe(phoneKey("+234 803 123 4567"));
    expect(phoneKey("8031234567")).toBe(phoneKey("08031234567"));
  });
});

describe("planImport", () => {
  it("adds valid people with their department and known tags", () => {
    const plan = planImport(rowsFrom("Name,Phone,Gender,Department,Tags,Date joined\nAda Obi,08031234567,F,choir,member,15/03/2026"), ctx());
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0]).toMatchObject({
      full_name: "Ada Obi", gender: "female", departmentId: "d-choir", tags: ["Member"], first_visit_date: "2026-03-15", source: "CSV import",
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });
  it("skips people already here, so importing the same file twice adds nobody new", () => {
    const existing = [{ id: "p1", full_name: "Ada Obi", phone: "+234 803 123 4567" }, { id: "p2", full_name: "No Phone", phone: null }];
    const plan = planImport(rowsFrom("Name,Phone\nada  obi,08031234567\nNo Phone,"), ctx(existing));
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["Already in the system", "Already in the system"]);
  });
  it("skips a person repeated in the file, naming the earlier row", () => {
    const plan = planImport(rowsFrom("Name,Phone\nAda,0803111\nAda,0803111"), ctx());
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.skipped).toEqual([{ row: 3, name: "Ada", reason: "Same person as row 2" }]);
  });
  it("adds but flags same-phone or same-name matches, like self-registration", () => {
    const existing = [{ id: "p1", full_name: "Ada Obi", phone: "08031234567" }];
    const plan = planImport(rowsFrom("Name,Phone\nChidi Obi,08031234567\nAda Obi,09099999999"), ctx(existing));
    expect(plan.toCreate.map((p) => p.possibleDuplicates)).toEqual([[{ personId: "p1", on: "phone" }], [{ personId: "p1", on: "name" }]]);
  });
  it("skips rows with no name, and keeps rows with bad details minus those details", () => {
    const plan = planImport(
      rowsFrom("Name,Phone,Email,Gender,Department,Tags,First visit\n,0803\nAda,8.03E+09,not-an-email,Other,Drama,VIP,yesterday"),
      ctx(),
    );
    expect(plan.skipped).toEqual([{ row: 2, name: "", reason: "No name" }]);
    expect(plan.toCreate[0]).toMatchObject({ full_name: "Ada", phone: null, email: null, gender: null, departmentId: null, tags: [], first_visit_date: null });
    expect(plan.warnings.map((w) => w.row)).toEqual([3, 3, 3, 3, 3, 3]);
  });
});
