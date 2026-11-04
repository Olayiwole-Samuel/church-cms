import { adminRoute } from "@/lib/http";
import { absenceAlerts } from "@/lib/queries";

export const GET = adminRoute(({ req }) => absenceAlerts(req.nextUrl.searchParams.has("all")));
