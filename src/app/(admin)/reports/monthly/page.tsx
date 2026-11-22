import Link from "next/link";
import { AutoSelect } from "@/components/AutoSelect";
import { LineChart } from "@/components/Charts";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { AttendanceVerdict } from "@/components/AttendanceVerdict";
import { monthlyAttendance } from "@/lib/queries";

export const metadata = { title: "Monthly Report" };

const signed = (n: number | null) => (n === null ? "—" : n > 0 ? `+${n}` : n === 0 ? "No change" : `${n}`);

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const r = await monthlyAttendance(sp.month, sp.program);
  const query = `month=${r.month}${r.programId ? `&program=${r.programId}` : ""}`;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{r.label}</h1>
          <p className="page-sub">Monthly report{r.inProgress ? ", so far this month" : ""}</p>
        </div>
        <div className="head-actions">
          <a className="btn" href={`/api/export/monthly-attendance?format=csv&${query}`}>CSV</a>
          <a className="btn" href={`/api/export/monthly-attendance?format=xlsx&${query}`}>Excel</a>
        </div>
      </div>

      <form method="get" className="filters" style={{ marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <AutoSelect name="month" defaultValue={r.month} aria-label="Month" style={{ backgroundColor: "var(--fill-2)" }}>
          {r.months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </AutoSelect>
        <AutoSelect name="program" defaultValue={r.programId ?? ""} aria-label="Program" style={{ backgroundColor: "var(--fill-2)" }}>
          <option value="">All services</option>
          {r.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </AutoSelect>
      </form>

      {r.inProgress && <div className="alert info" style={{ marginBottom: 0 }}>This month is still running, so these numbers can change until it ends.</div>}

      <section className="card">
        <AttendanceVerdict comparison={r.comparison} average={r.summary.average} serviceCount={r.summary.serviceCount} previousAverage={r.previous.average} previousLabel={r.previous.label} />
        <div className="stats" style={{ marginTop: 14 }}>
          <div className="stat flat"><b>{r.summary.average}</b><span>Average per service</span></div>
          <div className="stat flat"><b>{r.summary.serviceCount}</b><span>Services held</span></div>
          <div className="stat flat"><b>{r.summary.highest}</b><span>Highest service</span></div>
          <div className="stat flat"><b>{r.summary.lowest}</b><span>Lowest service</span></div>
        </div>
        <p className="small muted" style={{ margin: "12px 0 0" }}>
          Average per service: {r.breakdown.male} male, {r.breakdown.female} female, {r.breakdown.children} children. Services are not added together.
          {r.notEntered > 0 && ` ${r.notEntered} ${r.notEntered === 1 ? "service has" : "services have"} no numbers yet and ${r.notEntered === 1 ? "is" : "are"} left out.`}
        </p>
      </section>

      <section className="card">
        <h2>People at each service</h2>
        <DataTable
          rows={r.services}
          rowKey={(s) => s.id}
          empty="No services this month."
          mobile={(s) => (
            <div className="spread">
              <span>
                {s.program_name}
                <span className="sub">{fmtDate(s.date)}.{s.present === null ? " Not entered" : ` ${s.male} male, ${s.female} female, ${s.children} children. ${signed(s.change)}${s.change === null ? "" : " from the service before"}`}</span>
              </span>
              <strong className="num" style={{ fontSize: 22 }}>{s.present ?? "—"}</strong>
            </div>
          )}
          columns={[
            { label: "Date", nowrap: true, render: (s) => fmtDate(s.date) },
            { label: "Service", render: (s) => s.program_name },
            { label: "Male", align: "right", render: (s) => s.male ?? "—" },
            { label: "Female", align: "right", render: (s) => s.female ?? "—" },
            { label: "Children", align: "right", render: (s) => s.children ?? "—" },
            { label: "Total", align: "right", render: (s) => (s.present === null ? "Not entered" : <strong>{s.present}</strong>) },
            { label: "From the service before", align: "right", render: (s) => signed(s.change) },
            { label: "Details", render: (s) => <Link className="btn sm" href={`/attendance?program=${s.program_id}&session=${s.id}`}>{s.present === null ? "Enter" : "Edit"}</Link> },
          ]}
        />
      </section>

      {r.trend.length > 1 && (
        <section className="card">
          <h2>Average per service by month</h2>
          <div className="only-phone"><LineChart points={r.trend} unit="per service" /></div>
          <div className="only-wide"><LineChart points={r.trend} unit="per service" wide /></div>
          <details>
            <summary>Show as table</summary>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Month</th><th className="num">Average</th><th className="num">Services</th></tr></thead>
                <tbody>
                  {r.trend.map((t) => <tr key={t.date}><td>{t.label}</td><td className="num">{t.value}</td><td className="num">{t.services}</td></tr>)}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
