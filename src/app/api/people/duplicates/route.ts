import { adminRoute } from "@/lib/http";
import { openDuplicates } from "@/lib/queries";

export const GET = adminRoute(() => openDuplicates());
