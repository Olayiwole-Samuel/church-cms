import Link from "next/link";
import { BarList, LineChart, StackedBars } from "@/components/Charts";
import { AttendanceVerdict } from "@/components/AttendanceVerdict";
import { monthlyAttendance, report } from "@/lib/queries";

export const metadata = { title: "Reports" };

const short = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const STATUSES = ["First Timer", "Occasional", "Consistent", "Dropped Off", "Never Returned"];

export default async function ReportsPage() {
  const [monthly, trends, funnel, academy, reviews, departments] = await Promise.all([
    monthlyAttendance(),
    report("attendance-trends"),
    report("engagement-funnel"),
    report("academy-pipeline"),
    report("review-completion"),
    report("department-attendance"),
  ]);

  const byProgram = new Map<string, { date: string; label: string; value: number }[]>();
  for (const t of trends ?? []) {
    if (!byProgram.has(t.program_name)) byProgram.set(t.program_name, []);
    byProgram.get(t.program_name)!.push({ date: t.date, label: short(t.date), value: t.present });
  }
  const funnelPrograms = [...new Set((funnel ?? []).map((f) => f.program_name as string))];
  const empty = <p className="empty">No data yet.</p>;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>Reports</h1></div>

      <section className="card">
        <div className="panel-head">
          <h2>Monthly report: {monthly.label}</h2>
          <Link href="/reports/monthly">Open report</Link>
        </div>
        <div style={{ marginTop: 8 }}>
          <AttendanceVerdict comparison={monthly.comparison} average={monthly.summary.average} serviceCount={monthly.summary.serviceCount} previousAverage={monthly.previous.average} previousLabel={monthly.previous.label} />
        </div>
      </section>

      <section className="card">
        <h2>Attendance trends</h2>
        {byProgram.size === 0 && empty}
        <div className={byProgram.size > 1 ? "grid-2" : ""}>
          {[...byProgram.entries()].map(([name, points]) => (
            <div key={name}>
              <h3>{name}</h3>
              {byProgram.size > 1 ? (
                <LineChart points={points} />
              ) : (
                <>
                  <div className="only-phone"><LineChart points={points} /></div>
                  <div className="only-wide"><LineChart points={points} wide /></div>
                </>
              )}
              <details>
                <summary>Show as table</summary>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th className="num">Present</th></tr></thead>
                    <tbody>
                      {points.map((p) => <tr key={p.date}><td>{p.label}</td><td className="num">{p.value}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Engagement funnel</h2>
        {funnelPrograms.length === 0 && empty}
        <div className="grid-2">
          {funnelPrograms.map((program) => (
            <div key={program}>
              <h3>{program}</h3>
              <BarList
                rows={STATUSES.map((status) => ({
                  label: status,
                  value: funnel?.find((f) => f.program_name === program && f.status_badge === status)?.n ?? 0,
                }))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Academy pipeline</h2>
        <BarList rows={(academy ?? []).map((a) => ({ label: a.stage, value: a.n }))} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Review completion</h2>
          {(reviews ?? []).length === 0 ? empty : (
            <StackedBars
              aLabel="Submitted"
              bLabel="Pending"
              rows={(reviews ?? []).map((r) => ({ label: r.department_name, a: r.submitted, b: r.pending }))}
            />
          )}
        </section>
        <section className="card">
          <h2>Department attendance</h2>
          {(departments ?? []).length === 0 ? empty : (
            <StackedBars
              aLabel="Present"
              bLabel="Missed"
              rows={(departments ?? []).map((d) => ({ label: d.department_name, a: d.present, b: d.missed }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}
