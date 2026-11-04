import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { restoreMember } from "@/lib/services";

const schema = z.object({ note: z.string().trim().nullish() });

export const POST = adminRoute<{ id: string; person: string }>(async ({ req, params, actor }) => {
  const { note } = schema.parse(await req.json().catch(() => ({})));
  await withTx(actor, (tx) => restoreMember(tx, params.id, params.person, note));
  return { ok: true };
});
