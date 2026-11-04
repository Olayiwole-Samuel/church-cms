import { z } from "zod";
import { txOne, txRows, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";
import { sessionAttendance, unmarkedRoster } from "@/lib/queries";
import { recomputePeople } from "@/lib/recompute";

const schema = z.object({ notes: z.string().trim().nullish(), archived: z.boolean().optional() });

export const GET = adminRoute<{ id: string }>(async ({ params }) => ({
  attendance: await sessionAttendance(params.id),
  unmarked: await unmarkedRoster(params.id),
}));

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { notes, archived } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const session = await txOne(
      tx,
      `UPDATE sessions SET
         notes = CASE WHEN $2::boolean THEN $3 ELSE notes END,
         archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN now() ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [params.id, notes !== undefined, notes ?? null, archived ?? null],
    );
    if (!session) throw notFound("Session");
    if (archived !== undefined) {
      const people = await txRows<{ person_id: string }>(tx, `SELECT person_id FROM attendance WHERE session_id = $1`, [params.id]);
      await recomputePeople(tx, people.map((p) => p.person_id));
    }
    return session;
  });
});
