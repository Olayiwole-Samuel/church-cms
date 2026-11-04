import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listReviews, reviewDetail } from "@/lib/queries";
import { submitReview } from "@/lib/services";

const schema = z.object({
  department_id: z.string().uuid(),
  session_id: z.string().uuid(),
  summary: z.string().trim().min(1, "A summary is required"),
  challenges: z.string().trim().nullish(),
  highlights: z.string().trim().nullish(),
  notes: z.array(z.object({ person_id: z.string().uuid(), note: z.string() })).default([]),
});

export const GET = adminRoute(async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const department = q.get("department_id");
  const session = q.get("session_id");
  if (department && session) return reviewDetail(department, session);
  return listReviews((q.get("status") as "pending" | "submitted") || undefined, department ?? undefined);
});

export const POST = adminRoute(async ({ req, actor }) => {
  const input = schema.parse(await req.json());
  return withTx(actor, (tx) => submitReview(tx, input));
});
