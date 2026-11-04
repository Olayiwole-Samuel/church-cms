import { z } from "zod";
import { today } from "@/lib/config";
import { txOne, withTx } from "@/lib/db";
import { adminRoute, HttpError } from "@/lib/http";
import { closeOutSession } from "@/lib/recompute";

const schema = z.object({ session_id: z.string().uuid() });

/** "No scan on a service day = missed." Runs early what the daily job does anyway. */
export const POST = adminRoute<{ id: string }>(async ({ req, params, actor }) => {
  const { session_id } = schema.parse(await req.json());
  return withTx(actor, async (tx) => {
    const session = await txOne<{ date: string }>(tx, `SELECT date FROM sessions WHERE id = $1`, [session_id]);
    if (!session) throw new HttpError(404, "Session not found.");
    if (session.date > today()) throw new HttpError(400, "This session has not happened yet.");
    return { marked_missed: await closeOutSession(tx, session_id, params.id) };
  });
});
