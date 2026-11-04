import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";
import { personProfile } from "@/lib/queries";
import { recomputePeople } from "@/lib/recompute";

const schema = z.object({
  full_name: z.string().trim().min(1).optional(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().or(z.literal("")).nullish(),
  gender: z.string().trim().nullish(),
  address: z.string().trim().nullish(),
  source: z.string().trim().nullish(),
  status: z.enum(["active", "archived"]).optional(),
});

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const profile = await personProfile(params.id);
  if (!profile) throw notFound("Person");
  return profile;
});

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const input = schema.parse(await req.json());
  // Column names come from the schema keys above, never from the request directly.
  const fields = Object.entries(input).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return { ok: true };
  const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values = fields.map(([, v]) => (v === "" ? null : v));
  return withTx(actor, async (tx) => {
    const person = await txOne(tx, `UPDATE people SET ${sets} WHERE id = $1 RETURNING *`, [params.id, ...values]);
    if (!person) throw notFound("Person");
    if (input.status === "active") await recomputePeople(tx, [params.id]);
    // Someone removed from the church no longer needs following up.
    if (input.status === "archived") {
      await tx.query(`UPDATE follow_ups SET status = 'done' WHERE person_id = $1 AND status = 'open'`, [params.id]);
    }
    return person;
  });
});
