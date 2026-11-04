import { adminRoute, notFound } from "@/lib/http";
import { departmentCheckinUrl, qrResponse } from "@/lib/qr";
import { getDepartment } from "@/lib/queries";

export const GET = adminRoute<{ id: string }>(async ({ req, params }) => {
  const department = await getDepartment(params.id);
  if (!department) throw notFound("Department");
  return qrResponse(req, departmentCheckinUrl(req, department.qr_token), department.name);
});
