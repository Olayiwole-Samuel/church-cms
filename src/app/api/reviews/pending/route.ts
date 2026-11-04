import { adminRoute } from "@/lib/http";
import { listReviews } from "@/lib/queries";

export const GET = adminRoute(() => listReviews("pending"));
