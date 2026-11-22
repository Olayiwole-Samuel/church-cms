import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { addAltarCall } from "@/lib/services";

const schema = z.object({
  session_id: z.string().uuid("Please choose the service"),
  full_name: z.string().trim().min(1, "Please enter the name").max(200),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().email().max(200).or(z.literal("")).nullish(),
  gender: z.enum(["Male", "Female"]).nullish(),
  address: z.string().trim().max(500).nullish(),
});

export const POST = adminRoute(async ({ req, actor }) => {
  const { session_id, ...person } = schema.parse(await req.json());
  return withTx(actor, (tx) => addAltarCall(tx, session_id, person, actor));
});
