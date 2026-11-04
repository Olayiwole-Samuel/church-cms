import { adminRoute } from "@/lib/http";
import { dashboard } from "@/lib/queries";

export const GET = adminRoute(() => dashboard());
