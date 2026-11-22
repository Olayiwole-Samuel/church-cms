import { churchCheckinToken } from "@/lib/checkin";
import { adminRoute, notFound } from "@/lib/http";
import { churchCheckinUrl, qrResponse } from "@/lib/qr";

/** The church's one member check-in QR, as PNG or SVG. */
export const GET = adminRoute(async ({ req }) => {
  const token = await churchCheckinToken();
  if (!token) throw notFound("Check-in code");
  return qrResponse(req, churchCheckinUrl(req, token), "church-check-in");
});
