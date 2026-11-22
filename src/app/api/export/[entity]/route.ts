import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/export";
import { adminRoute, HttpError, notFound } from "@/lib/http";
import { EXPORT_QUERIES, monthlyAttendance } from "@/lib/queries";

export const maxDuration = 60;

const columnsOf = (rows: Record<string, unknown>[]) => (rows[0] ? Object.keys(rows[0]) : ["(no rows)"]);

/** ?format=csv|xlsx. The entity "all" is one workbook with a sheet per entity (xlsx only). */
export const GET = adminRoute<{ entity: string }>(async ({ req, params }) => {
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const stamp = new Date().toISOString().slice(0, 10);
  const xlsxHeaders = (name: string) => ({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${name}-${stamp}.xlsx"`,
  });

  if (params.entity === "monthly-attendance") {
    const r = await monthlyAttendance(req.nextUrl.searchParams.get("month"), req.nextUrl.searchParams.get("program"));
    const rows: Record<string, unknown>[] = r.services.map((s) => ({
      date: s.date,
      service: s.program_name,
      male: s.male ?? "",
      female: s.female ?? "",
      children: s.children ?? "",
      people_present: s.present ?? "Not entered",
      from_service_before: s.change ?? "",
    }));
    rows.push({ date: "", service: "Average per service", people_present: r.summary.average, from_service_before: "" });
    rows.push({ date: "", service: `Average per service, ${r.previous.label}`, people_present: r.previous.serviceCount ? r.previous.average : "", from_service_before: "" });
    rows.push({ date: "", service: "Change in average", people_present: r.comparison?.net ?? "", from_service_before: "" });
    rows.push({ date: "", service: "Average per service, by group", male: r.breakdown.male, female: r.breakdown.female, children: r.breakdown.children, people_present: "", from_service_before: "" });
    const columns = ["date", "service", "male", "female", "children", "people_present", "from_service_before"];
    const name = `monthly-attendance-${r.month}`;
    if (format === "xlsx") return new NextResponse(await toXlsx([{ name: r.month, rows, columns }]), { headers: xlsxHeaders(name) });
    return new NextResponse(toCsv(rows, columns), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }

  if (params.entity === "all") {
    if (format !== "xlsx") throw new HttpError(400, "Exporting everything requires format=xlsx.");
    const sheets = [];
    for (const [name, sql] of Object.entries(EXPORT_QUERIES)) {
      const rows = await query(sql);
      sheets.push({ name, rows, columns: columnsOf(rows) });
    }
    return new NextResponse(await toXlsx(sheets), { headers: xlsxHeaders("church-cms-all") });
  }

  const sql = Object.hasOwn(EXPORT_QUERIES, params.entity) ? EXPORT_QUERIES[params.entity] : null;
  if (!sql) throw notFound("Export");
  const rows = await query(sql);
  const columns = columnsOf(rows);
  if (format === "xlsx") {
    return new NextResponse(await toXlsx([{ name: params.entity, rows, columns }]), { headers: xlsxHeaders(params.entity) });
  }
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${params.entity}-${stamp}.csv"`,
    },
  });
});
