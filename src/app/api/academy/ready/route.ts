import { adminRoute } from "@/lib/http";
import { academyEnrolled, academyReady } from "@/lib/queries";

export const GET = adminRoute(async () => ({ ready: await academyReady(), enrolled: await academyEnrolled() }));
