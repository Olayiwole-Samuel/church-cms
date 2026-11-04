import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listFollowUps } from "@/lib/queries";

const schema = z.object({
  person_id: z.string().uuid(),
  reason: z.enum(["first_timer", "drop_off", "altar_call", "absence"]),
  priority: z.enum(["normal", "high"]).optional(),
  assigned_to: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
});

export const GET = adminRoute(({ req }) => listFollowUps(req.nextUrl.searchParams.get("status") ?? "open"));

export const POST = adminRoute(async ({ req, actor }) => {
  const f = schema.parse(await req.json());
  // Altar-call follow-ups are always high priority.
  const priority = f.reason === "altar_call" ? "high" : (f.priority ?? "normal");
  return withTx(actor, (tx) =>
    txOne(
      tx,
      `INSERT INTO follow_ups (person_id, reason, priority, assigned_to, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [f.person_id, f.reason, priority, f.assigned_to || null, f.notes || null],
    ),
  );
});
