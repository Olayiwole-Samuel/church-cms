import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute, notFound } from "@/lib/http";
import { departmentMembers, getDepartment } from "@/lib/queries";

const schema = z.object({ name: z.string().trim().min(1).optional(), archived: z.boolean().optional() });

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const department = await getDepartment(params.id);
  if (!department) throw notFound("Department");
  return { department, members: await departmentMembers(params.id) };
});

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { name, archived } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const department = await txOne(
      tx,
      `UPDATE departments SET name = coalesce($2, name),
         archived_at = CASE WHEN $3::boolean IS NULL THEN archived_at WHEN $3 THEN now() ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [params.id, name ?? null, archived ?? null],
    );
    if (!department) throw notFound("Department");
    return department;
  });
});
