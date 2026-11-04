import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { createPerson } from "@/lib/services";

const schema = z.object({ full_name: z.string().trim().min(1) });

export const POST = adminRoute(async ({ req, actor }) => {
  const { full_name } = schema.parse(await req.json());
  return withTx(actor, (tx) => createPerson(tx, { full_name, source: "quick_add" }));
});
