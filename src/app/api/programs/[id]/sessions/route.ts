import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listSessions } from "@/lib/queries";
import { createSession } from "@/lib/services";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date"),
  notes: z.string().trim().nullish(),
});

export const GET = adminRoute<{ id: string }>(({ params }) => listSessions(params.id));

export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { date, notes } = schema.parse(await req.json());
  return withTx(actor, (tx) => createSession(tx, params.id, date, notes));
});
