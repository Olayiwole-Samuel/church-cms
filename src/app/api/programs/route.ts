import { z } from "zod";
import { txOne, withTx } from "@/lib/db";
import { adminRoute } from "@/lib/http";
import { listPrograms } from "@/lib/queries";
import { newQrToken } from "@/lib/services";

const schema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["regular", "special"]),
  counts_toward_streak: z.boolean().default(true),
  is_sunday: z.boolean().default(false),
});

export const GET = adminRoute(({ req }) => listPrograms(req.nextUrl.searchParams.has("archived")));

export const POST = adminRoute(async ({ req, actor }) => {
  const p = schema.parse(await req.json());
  return withTx(actor, (tx) =>
    txOne(
      tx,
      `INSERT INTO programs (name, type, counts_toward_streak, is_sunday, qr_token)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [p.name, p.type, p.counts_toward_streak, p.is_sunday, newQrToken()],
    ),
  );
});
