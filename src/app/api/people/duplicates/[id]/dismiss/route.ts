import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";

export const POST = adminRoute<{ id: string }>(async ({ params, actor }) => {
  await withTx(actor, (tx) => tx.query(`UPDATE possible_duplicates SET status = 'dismissed' WHERE id = $1`, [params.id]));
  return { ok: true };
});
