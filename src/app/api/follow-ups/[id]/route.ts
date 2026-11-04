import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";

const schema = z.object({
  status: z.enum(["open", "done"]).optional(),
  priority: z.enum(["normal", "high"]).optional(),
  assigned_to: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
});

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const f = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const row = await txOne(
      tx,
      `UPDATE follow_ups SET
         status = coalesce($2, status),
         priority = coalesce($3, priority),
         assigned_to = CASE WHEN $4::boolean THEN $5 ELSE assigned_to END,
         notes = CASE WHEN $6::boolean THEN $7 ELSE notes END
       WHERE id = $1 RETURNING *`,
      [params.id, f.status ?? null, f.priority ?? null, f.assigned_to !== undefined, f.assigned_to || null, f.notes !== undefined, f.notes || null],
    );
    if (!row) throw notFound("Follow-up");
    return row;
  });
});
