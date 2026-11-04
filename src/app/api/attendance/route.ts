import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { markAbsentBulk, recordAttendance } from "@/lib/services";

const schema = z.union([
  z.object({
    session_id: z.string().uuid(),
    person_ids: z.array(z.string().uuid()).min(1),
    bulk_absent: z.literal(true),
  }),
  z.object({
    session_id: z.string().uuid(),
    person_id: z.string().uuid(),
    present: z.boolean().default(true),
    altar_call: z.boolean().optional(),
    method: z.enum(["admin", "on_behalf"]).default("admin"),
  }),
]);

export const POST = adminRoute(async ({ req, actor }) => {
  const input = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    if ("bulk_absent" in input) {
      return { marked: await markAbsentBulk(tx, input.session_id, input.person_ids, actor) };
    }
    return recordAttendance(tx, {
      sessionId: input.session_id,
      personId: input.person_id,
      present: input.present,
      altarCall: input.altar_call,
      method: input.method,
      recordedBy: actor,
    });
  });
});
