import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { recordAttendance } from "@/lib/services";

// An individual mark, used only to monitor people in the altar-call track.
// The church's attendance is the headcount: see /api/sessions/:id/headcount.
const schema = z.object({
  session_id: z.string().uuid(),
  person_id: z.string().uuid(),
  present: z.boolean().default(true),
});

export const POST = adminRoute(async ({ req, actor }) => {
  const input = schema.parse(await req.json());
  return withTx(actor, (tx) =>
    recordAttendance(tx, {
      sessionId: input.session_id,
      personId: input.person_id,
      present: input.present,
      method: "admin",
      recordedBy: actor,
    }),
  );
});
