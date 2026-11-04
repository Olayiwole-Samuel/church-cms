import { adminRoute, notFound } from "@/lib/http";
import { monthlyAttendance, report } from "@/lib/queries";

export const GET = adminRoute<{ type: string }>(async ({ req, params }) => {
  const q = req.nextUrl.searchParams;
  if (params.type === "monthly-attendance") return monthlyAttendance(q.get("month"), q.get("program"));
  const data = await report(params.type);
  if (!data) throw notFound("Report");
  return data;
});
