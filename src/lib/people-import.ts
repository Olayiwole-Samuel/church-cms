import { today } from "./config";
import { Tx, txRows } from "./db";
import { ImportPlan, ImportRow, planImport } from "./csv-import";
import { applyTag } from "./recompute";

export interface ImportResult {
  dryRun: boolean;
  added: number;
  skipped: ImportPlan["skipped"];
  warnings: ImportPlan["warnings"];
  flaggedAsPossibleDuplicates: number;
  addedToDepartments: number;
  tagsApplied: number;
  /** The first few people to be added, so the admin can sanity-check the result. */
  sample: { row: number; full_name: string; phone: string | null; department: string | null }[];
}

/**
 * Plans an import against the live database and, unless dryRun, writes it in the caller's
 * transaction. The audit log records every row added. Archived people count as existing,
 * so an import never silently re-creates someone who was removed.
 */
export async function importPeople(tx: Tx, rows: ImportRow[], dryRun: boolean): Promise<ImportResult> {
  const [existing, departments, tags] = await Promise.all([
    txRows<{ id: string; full_name: string; phone: string | null }>(tx, `SELECT id, full_name, phone FROM people`),
    txRows<{ id: string; name: string }>(tx, `SELECT id, name FROM departments WHERE archived_at IS NULL`),
    txRows<{ name: string }>(tx, `SELECT name FROM tags`),
  ]);
  const plan = planImport(rows, { existing, departments, tags: tags.map((t) => t.name), today: today() });

  let flagged = 0;
  let tagsApplied = 0;
  if (!dryRun) {
    for (const p of plan.toCreate) {
      const person = await txRows<{ id: string }>(
        tx,
        `INSERT INTO people (full_name, phone, email, gender, address, source, first_visit_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [p.full_name, p.phone, p.email, p.gender, p.address, p.source, p.first_visit_date],
      );
      const id = person[0].id;
      for (const d of p.possibleDuplicates) {
        await tx.query(
          `INSERT INTO possible_duplicates (person_id, matched_person_id, matched_on) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [id, d.personId, d.on],
        );
        flagged++;
      }
      if (p.departmentId) {
        await tx.query(`INSERT INTO department_memberships (person_id, department_id) VALUES ($1, $2)`, [id, p.departmentId]);
      }
      for (const tag of p.tags) {
        await applyTag(tx, id, tag);
        tagsApplied++;
      }
    }
  } else {
    flagged = plan.toCreate.reduce((n, p) => n + p.possibleDuplicates.length, 0);
    tagsApplied = plan.toCreate.reduce((n, p) => n + p.tags.length, 0);
  }

  return {
    dryRun,
    added: plan.toCreate.length,
    skipped: plan.skipped,
    warnings: plan.warnings,
    flaggedAsPossibleDuplicates: flagged,
    addedToDepartments: plan.toCreate.filter((p) => p.departmentId).length,
    tagsApplied,
    sample: plan.toCreate.slice(0, 5).map((p) => ({ row: p.row, full_name: p.full_name, phone: p.phone, department: p.departmentName })),
  };
}
