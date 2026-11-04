import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { enroll } from "@/lib/services";

const schema = z.object({ person_id: z.string().uuid(), note: z.string().trim().nullish() });

export const POST = adminRoute(async ({ req, actor }) => {
  const { person_id, note } = schema.parse(await req.json());
  await withTx(actor, (tx) => enroll(tx, person_id, note));
  return { ok: true };
});
