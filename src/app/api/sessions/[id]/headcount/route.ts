import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { saveHeadcount } from "@/lib/services";

const count = z.number().int("must be a whole number").min(0, "cannot be negative").max(100_000);
const schema = z.object({ male: count, female: count, children: count });

export const PUT = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const counts = schema.parse(await req.json());
  return withTx(actor, (tx) => saveHeadcount(tx, { sessionId: params.id, ...counts, recordedBy: actor }));
});
