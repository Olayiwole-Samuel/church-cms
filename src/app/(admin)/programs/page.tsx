import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { ApiForm, SheetButton } from "@/components/ui";
import { listPrograms } from "@/lib/queries";

export const metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const programs = await listPrograms(true);
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>Programs</h1>
        <SheetButton label="New Program" title="New program" className="btn primary">
          <ApiForm
            path="/api/programs"
            submitLabel="Create program"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "type", label: "Type", type: "select", options: [{ value: "regular", label: "Regular" }, { value: "special", label: "Special" }] },
              { name: "counts_toward_streak", label: "Counts toward streak", type: "checkbox", defaultChecked: true },
              { name: "is_sunday", label: "Sunday service (counts for Academy)", type: "checkbox" },
            ]}
          />
        </SheetButton>
      </div>
      <section className="card">
        <DataTable
          rows={programs}
          rowKey={(p) => p.id}
          href={(p) => `/programs/${p.id}`}
          empty="No programs yet."
          mobile={(p) => (
            <>
              {p.name}
              <span className="sub">{p.session_count} sessions, last {fmtDate(p.last_session)}</span>
              <span className="row-tags">
                <span className="badge">{p.type === "special" ? "Special" : "Regular"}</span>
                {p.is_sunday && <span className="badge accent">Sunday</span>}
                {p.counts_toward_streak && <span className="badge">Counts toward streak</span>}
                {p.archived_at && <span className="badge danger">Archived</span>}
              </span>
            </>
          )}
          columns={[
            { label: "Program", render: (p) => p.name },
            {
              label: "Type",
              render: (p) => (
                <span className="row" style={{ gap: 4 }}>
                  <span className="badge">{p.type === "special" ? "Special" : "Regular"}</span>
                  {p.is_sunday && <span className="badge accent">Sunday</span>}
                </span>
              ),
            },
            { label: "Counts toward streak", desktopOnly: true, render: (p) => (p.counts_toward_streak ? "Yes" : "No") },
            { label: "Sessions", align: "right", render: (p) => p.session_count },
            { label: "Last session", nowrap: true, render: (p) => fmtDate(p.last_session) },
            { label: "Status", render: (p) => (p.archived_at ? <span className="badge danger">Archived</span> : <span className="badge good">Active</span>) },
          ]}
        />
      </section>
    </div>
  );
}
