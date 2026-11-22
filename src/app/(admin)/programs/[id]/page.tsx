import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { today } from "@/lib/config";
import { getProgram, listSessions } from "@/lib/queries";

export const metadata = { title: "Program" };

const counted = (s: Record<string, unknown>) =>
  s.present_count === null ? "Attendance not entered" : `${s.present_count} present (${s.male} male, ${s.female} female, ${s.children} children)`;

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const program = await getProgram(id);
  if (!program) notFound();
  const sessions = await listSessions(id);
  const archiveButton = (sessionId: string) => (
    <ActionButton path={`/api/sessions/${sessionId}`} method="PUT" body={{ archived: true }} confirm="Archive this session? It stops counting toward streaks.">Archive</ActionButton>
  );

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{program.name}</h1>
          <div className="row" style={{ gap: 4, marginTop: 6 }}>
            <span className="badge">{program.type === "special" ? "Special" : "Regular"}</span>
            {program.is_sunday && <span className="badge accent">Sunday</span>}
            {program.counts_toward_streak && <span className="badge">Counts toward streak</span>}
            {program.archived_at && <span className="badge danger">Archived</span>}
          </div>
        </div>
        <div className="head-actions">
          <SheetButton label="Edit" title="Edit program">
            <ApiForm
              path={`/api/programs/${id}`}
              method="PUT"
              submitLabel="Save"
              resetOnSuccess={false}
              fields={[
                { name: "name", label: "Name", required: true, defaultValue: program.name },
                { name: "type", label: "Type", type: "select", defaultValue: program.type, options: [{ value: "regular", label: "Regular" }, { value: "special", label: "Special" }] },
                { name: "counts_toward_streak", label: "Counts toward streak", type: "checkbox", defaultChecked: program.counts_toward_streak },
                { name: "is_sunday", label: "Sunday service (counts for Academy)", type: "checkbox", defaultChecked: program.is_sunday },
              ]}
            />
          </SheetButton>
          {program.archived_at ? (
            <ActionButton className="btn" path={`/api/programs/${id}`} method="PUT" body={{ archived: false }}>Restore</ActionButton>
          ) : (
            <ActionButton className="btn" path={`/api/programs/${id}`} method="PUT" body={{ archived: true }} confirm="Archive this program? Its history is kept and you can restore it.">Archive</ActionButton>
          )}
          <SheetButton label="New Session" title="New session" className="btn primary">
            <ApiForm
              path={`/api/programs/${id}/sessions`}
              submitLabel="Add session"
              fields={[
                { name: "date", label: "Date", type: "date", required: true, defaultValue: today() },
                { name: "notes", label: "Notes" },
              ]}
            />
          </SheetButton>
        </div>
      </div>

          <section className="card">
            <div className="only-phone"><h2>Sessions</h2></div>
            <DataTable
              rows={sessions}
              rowKey={(s) => s.id}
              empty="No sessions yet. QR check-in only works once today's session exists."
              mobile={(s) => (
                <div className="spread">
                  <Link href={`/attendance?program=${id}&session=${s.id}`}>
                    {fmtDate(s.date)}
                    <span className="sub">{counted(s)}, {s.altar_count} altar call{s.notes ? `. ${s.notes}` : ""}</span>
                  </Link>
                  {archiveButton(s.id)}
                </div>
              )}
              columns={[
                { label: "Session", nowrap: true, render: (s) => <Link href={`/attendance?program=${id}&session=${s.id}`}>{fmtDate(s.date)}</Link> },
                { label: "Male", align: "right", render: (s) => s.male ?? "—" },
                { label: "Female", align: "right", render: (s) => s.female ?? "—" },
                { label: "Children", align: "right", render: (s) => s.children ?? "—" },
                { label: "Total", align: "right", render: (s) => (s.present_count === null ? "Not entered" : <strong>{s.present_count}</strong>) },
                { label: "Altar call", align: "right", render: (s) => s.altar_count },
                { label: "Notes", render: (s) => s.notes ?? "" },
                { label: "Actions", render: (s) => archiveButton(s.id) },
              ]}
            />
          </section>
    </div>
  );
}
