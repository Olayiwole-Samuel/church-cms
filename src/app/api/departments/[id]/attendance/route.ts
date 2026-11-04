import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute, HttpError } from "@/lib/http";
import { departmentSessionRoster } from "@/lib/queries";
import { recordDepartmentAttendance } from "@/lib/services";

const schema = z.object({
  session_id: z.string().uuid(),
  person_id: z.string().uuid(),
  present: z.boolean().default(true),
});

export const GET = adminRoute<{ id: string }>(async ({ req, params }) => {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) throw new HttpError(400, "session_id is required.");
  return departmentSessionRoster(params.id, sessionId);
});

export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const input = schema.parse(await req.json());
  const missStreak = await withTx(actor, (tx) =>
    recordDepartmentAttendance(tx, {
      sessionId: input.session_id,
      personId: input.person_id,
      departmentId: params.id,
      present: input.present,
      method: "admin",
    }),
  );
  return { miss_streak: missStreak };
});
