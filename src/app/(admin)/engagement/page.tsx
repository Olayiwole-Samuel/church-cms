import Link from "next/link";
import { AutoSelect } from "@/components/AutoSelect";
import { DataTable, PersonCell } from "@/components/DataTable";
import { fmtDate, fmtDateTime } from "@/components/format";
import { ActionButton } from "@/components/ui";
import { absenceAlerts, ENGAGEMENT_VIEWS, engagementCounts, engagementView, listPrograms } from "@/lib/queries";

export const metadata = { title: "Engagement" };

const GENERAL = "general";

export default async function EngagementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const programs = await listPrograms();
  // Default to the Sunday program: a general streak also needs every midweek service.
  const fallback = programs.find((p) => p.is_sunday)?.id ?? GENERAL;
  const selected = sp.program === GENERAL || programs.some((p) => p.id === sp.program) ? sp.program! : fallback;
  const programId = selected === GENERAL ? null : selected;
  const view = sp.view === "absence-alerts" || (sp.view && ENGAGEMENT_VIEWS[sp.view]) ? sp.view : "first-timers";
  const showingAlerts = view === "absence-alerts";

  const [rows, alerts, counts] = await Promise.all([
    showingAlerts ? Promise.resolve([]) : engagementView(view, programId),
    showingAlerts ? absenceAlerts() : Promise.resolve([]),
    engagementCounts(programId),
  ]);
  const count = (status: string) => counts.find((c) => c.status_badge === status)?.n ?? 0;
  const href = (v: string, p = selected) => `/engagement?view=${v}&program=${p}`;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Engagement</h1>
        <form method="get" style={{ width: "min(100%, 300px)" }}>
          <input type="hidden" name="view" value={view} />
          <AutoSelect name="program" defaultValue={selected} aria-label="Program" style={{ backgroundColor: "var(--fill-2)" }}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={GENERAL}>General (all counting programs)</option>
          </AutoSelect>
        </form>
      </div>

      <nav className="tabs">
        {Object.entries(ENGAGEMENT_VIEWS).map(([key, status]) => (
          <Link key={key} href={href(key)} className={view === key ? "active" : ""}>{status} ({count(status)})</Link>
        ))}
        <Link href={href("absence-alerts")} className={showingAlerts ? "active" : ""}>Absence alerts</Link>
      </nav>

      <section className="card">
        {showingAlerts ? (
          <DataTable
            rows={alerts}
            rowKey={(a) => a.id}
            empty="No open absence alerts."
            mobile={(a) => (
              <div className="spread">
                <span>
                  <Link href={`/people/${a.person_id}`}>{a.full_name}</Link>
                  <span className="sub">{a.program_name}, raised {fmtDateTime(a.triggered_at)}</span>
                </span>
                <ActionButton path={`/api/absence-alerts/${a.id}`} method="PUT" body={{ resolved: true }}>Resolve</ActionButton>
              </div>
            )}
            columns={[
              { label: "Name", render: (a) => <Link href={`/people/${a.person_id}`}><PersonCell name={a.full_name} /></Link> },
              { label: "Phone", nowrap: true, render: (a) => a.phone ?? "—" },
              { label: "Program", render: (a) => a.program_name },
              { label: "Raised", nowrap: true, render: (a) => fmtDateTime(a.triggered_at) },
              { label: "Actions", render: (a) => <ActionButton path={`/api/absence-alerts/${a.id}`} method="PUT" body={{ resolved: true }}>Resolve</ActionButton> },
            ]}
          />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.person_id}
            href={(r) => `/people/${r.person_id}`}
            empty="Nobody in this view."
            mobile={(r) => (
              <>
                {r.full_name}
                <span className="sub">
                  Streak {r.current_streak}, attended {r.total_attended}, missed {r.trailing_misses} in a row, last {fmtDate(r.last_attended)}
                  {r.phone ? `. ${r.phone}` : ""}
                </span>
              </>
            )}
            columns={[
              { label: "Name", render: (r) => <PersonCell name={r.full_name} /> },
              { label: "Phone", nowrap: true, desktopOnly: true, render: (r) => r.phone ?? "—" },
              { label: "Streak", align: "right", render: (r) => r.current_streak },
              { label: "Attended", align: "right", render: (r) => r.total_attended },
              { label: "Missed in a row", align: "right", render: (r) => r.trailing_misses },
              { label: "Last attended", nowrap: true, render: (r) => fmtDate(r.last_attended) },
            ]}
          />
        )}
      </section>
    </div>
  );
}
