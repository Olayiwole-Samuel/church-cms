import { adminRoute, notFound } from "@/lib/http";
import { programCheckinUrl, qrResponse } from "@/lib/qr";
import { getProgram } from "@/lib/queries";

export const GET = adminRoute<{ id: string }>(async ({ req, params }) => {
  const program = await getProgram(params.id);
  if (!program) throw notFound("Program");
  return qrResponse(req, programCheckinUrl(req, program.qr_token), program.name);
});
