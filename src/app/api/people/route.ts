import { z } from "zod";
import { withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listPeople } from "@/lib/queries";
import { createPerson } from "@/lib/services";

const personSchema = z.object({
  full_name: z.string().trim().min(1),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().or(z.literal("")).nullish(),
  gender: z.string().trim().nullish(),
  address: z.string().trim().nullish(),
  source: z.string().trim().nullish(),
});

export const GET = adminRoute(async ({ req }) => {
  const q = req.nextUrl.searchParams;
  return listPeople({
    q: q.get("q") ?? undefined,
    tag: q.get("tag") ?? undefined,
    status: q.get("status") ?? "active",
    limit: Math.min(Number(q.get("limit") || 50), 500),
    offset: Number(q.get("offset") || 0),
  });
});

export const POST = adminRoute(async ({ req, actor }) => {
  const input = personSchema.parse(await req.json());
  return withTx(actor, (tx) => createPerson(tx, input));
});
