import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

const baseUrl = (req: NextRequest) => (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");

export const programCheckinUrl = (req: NextRequest, token: string) => `${baseUrl(req)}/checkin/${token}`;
export const departmentCheckinUrl = (req: NextRequest, token: string) => `${baseUrl(req)}/checkin/dept/${token}`;

/** ?format=png|svg, and ?download=1 to save as a file. */
export async function qrResponse(req: NextRequest, url: string, filename: string) {
  const format = req.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=3600",
    "Content-Type": format === "svg" ? "image/svg+xml" : "image/png",
  };
  if (req.nextUrl.searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${filename.replace(/[^\w-]+/g, "-")}-qr.${format}"`;
  }
  if (format === "svg") {
    return new NextResponse(await QRCode.toString(url, { type: "svg", margin: 2 }), { headers });
  }
  const png = await QRCode.toBuffer(url, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M" });
  return new NextResponse(new Uint8Array(png), { headers });
}
