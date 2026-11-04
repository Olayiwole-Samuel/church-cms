import { adminRoute, notFound } from "@/lib/http";
import { absenceAlerts, ENGAGEMENT_VIEWS, engagementView } from "@/lib/queries";

/** ?program_id=<uuid> for one program. Omit it for the general streak. */
export const GET = adminRoute<{ view: string }>(async ({ req, params }) => {
  if (params.view === "absence-alerts") return absenceAlerts();
  if (!ENGAGEMENT_VIEWS[params.view]) throw notFound("View");
  return engagementView(params.view, req.nextUrl.searchParams.get("program_id"));
});
