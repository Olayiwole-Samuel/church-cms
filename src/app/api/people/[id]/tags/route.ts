import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { applyTag, removeTag } from "@/lib/recompute";

const schema = z.object({ tag: z.string().min(1), action: z.enum(["add", "remove"]).default("add") });

export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { tag, action } = schema.parse(await req.json());
  await withTx(actor, (tx) => (action === "add" ? applyTag(tx, params.id, tag) : removeTag(tx, params.id, tag)));
  return { ok: true };
});
