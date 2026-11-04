import { z } from "zod";
import { txOne, txRows, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";
import { getProgram } from "@/lib/queries";
import { recomputePeople } from "@/lib/recompute";

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["regular", "special"]).optional(),
  counts_toward_streak: z.boolean().optional(),
  is_sunday: z.boolean().optional(),
  archived: z.boolean().optional(),
});

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const program = await getProgram(params.id);
  if (!program) throw notFound("Program");
  return program;
});

// The qr_token is never updated: QR codes are permanent.
export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { archived, ...input } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const program = await txOne(
      tx,
      `UPDATE programs SET
         name = coalesce($2, name),
         type = coalesce($3, type),
         counts_toward_streak = coalesce($4, counts_toward_streak),
         is_sunday = coalesce($5, is_sunday),
         archived_at = CASE WHEN $6::boolean IS NULL THEN archived_at
                            WHEN $6 THEN now() ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [params.id, input.name ?? null, input.type ?? null, input.counts_toward_streak ?? null, input.is_sunday ?? null, archived ?? null],
    );
    if (!program) throw notFound("Program");
    // Rule inputs may have changed, so rebuild everyone who attended this program.
    const people = await txRows<{ person_id: string }>(
      tx,
      `SELECT DISTINCT a.person_id FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.program_id = $1`,
      [params.id],
    );
    await recomputePeople(tx, people.map((p) => p.person_id));
    return program;
  });
});
