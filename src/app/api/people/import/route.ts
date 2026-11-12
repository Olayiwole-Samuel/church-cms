import { z } from "zod";
import { MAX_IMPORT_ROWS } from "@/lib/csv-import";
import { withTx } from "@/lib/db";
import { adminRoute, HttpError } from "@/lib/http";
import { importPeople } from "@/lib/people-import";

export const maxDuration = 60;

const text = (max: number) => z.string().max(max).optional();
const schema = z.object({
  dryRun: z.boolean().default(true),
  rows: z
    .array(
      z.object({
        row: z.number().int().min(1),
        full_name: z.string().max(400),
        phone: text(60),
        email: text(320),
        gender: text(40),
        address: text(1000),
        first_visit_date: text(40),
        department: text(200),
        tags: z.array(z.string().max(100)).max(20).optional(),
        source: text(400),
      }),
    )
    .min(1, "The file has no rows to import")
    .max(MAX_IMPORT_ROWS, `Import at most ${MAX_IMPORT_ROWS} people at a time`),
});

/**
 * Two steps. dryRun: true reports what would happen and writes nothing. dryRun: false
 * writes it, re-checking against the database as it is at that moment.
 */
export const POST = adminRoute(async ({ req, actor }) => {
  const input = schema.parse(await req.json().catch(() => {
    throw new HttpError(400, "The upload could not be read.");
  }));
  return withTx(`${actor} (CSV import)`, (tx) => importPeople(tx, input.rows, input.dryRun));
});
