import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { setAltarCall } from "@/lib/services";

const schema = z.object({ altar_call: z.boolean().default(true) });

export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { altar_call } = schema.parse(await req.json());
  await withTx(actor, (tx) => setAltarCall(tx, params.id, altar_call));
  return { ok: true };
});
