import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { assignDepartment } from "@/lib/services";

const schema = z.object({ person_id: z.string().uuid() });

/** Admin only: add a person to this department, or move them here from their current one. */
export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { person_id } = schema.parse(await req.json());
  await withTx(actor, (tx) => assignDepartment(tx, person_id, params.id));
  return { ok: true };
});
