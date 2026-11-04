import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listDepartments } from "@/lib/queries";
import { ensurePendingReviews } from "@/lib/recompute";
import { newQrToken } from "@/lib/services";

const schema = z.object({ name: z.string().trim().min(1) });

export const GET = adminRoute(({ req }) => listDepartments(req.nextUrl.searchParams.has("archived")));

export const POST = adminRoute(async ({ req, actor }) => {
  const { name } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const department = await txOne(tx, `INSERT INTO departments (name, qr_token) VALUES ($1, $2) RETURNING *`, [name, newQrToken()]);
    await ensurePendingReviews(tx);
    return department;
  });
});
