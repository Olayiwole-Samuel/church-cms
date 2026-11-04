import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";

const schema = z.object({ resolved: z.boolean() });

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { resolved } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const row = await txOne(tx, `UPDATE absence_alerts SET resolved = $2 WHERE id = $1 RETURNING *`, [params.id, resolved]);
    if (!row) throw notFound("Alert");
    return row;
  });
});
