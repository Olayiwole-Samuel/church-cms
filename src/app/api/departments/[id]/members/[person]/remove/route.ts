import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { permanentlyRemoveMember } from "@/lib/services";

// Irreversible, so the caller must confirm explicitly.
const schema = z.object({ confirm: z.literal(true), note: z.string().trim().nullish() });

export const POST = adminRoute<{ id: string; person: string }>(async ({ req, params, actor }) => {
  const { note } = schema.parse(await req.json());
  await withTx(actor, (tx) => permanentlyRemoveMember(tx, params.id, params.person, note));
  return { ok: true };
});
