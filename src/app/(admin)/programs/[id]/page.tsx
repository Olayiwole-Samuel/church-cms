import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/components/format";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { today } from "@/lib/config";
import { getProgram, listSessions } from "@/lib/queries";

export const metadata = { title: "Program" };

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

      <div className="split">
        <div className="side">
          <section className="card">
            <h2>Permanent QR code</h2>
            <p className="small muted">Print once. This code never changes. It always checks people in to today&apos;s session of this program.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr-box" src={`/api/programs/${id}/qr?format=png`} alt={`Check-in QR code for ${program.name}`} />
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <a className="btn sm" href={`/api/programs/${id}/qr?format=png&download=1`}>Download PNG</a>
              <a className="btn sm" href={`/api/programs/${id}/qr?format=svg&download=1`}>Download SVG</a>
              <Link className="btn sm" href={`/checkin/${program.qr_token}`} target="_blank">Open check-in page</Link>
            </div>
          </section>
        </div>
        <div className="main-col">
          <section className="card">
            <div className="only-phone"><h2>Sessions</h2></div>
            <DataTable
              rows={sessions}
              rowKey={(s) => s.id}
              empty="No sessions yet. People can only check in once today's session exists."
              mobile={(s) => (
                <div className="spread">
                  <Link href={`/attendance?program=${id}&session=${s.id}`}>
                    {fmtDate(s.date)}
                    <span className="sub">{s.present_count} present, {s.altar_count} altar call{s.notes ? `. ${s.notes}` : ""}</span>
                  </Link>
                  {archiveButton(s.id)}
                </div>
              )}
              columns={[
                { label: "Session", nowrap: true, render: (s) => <Link href={`/attendance?program=${id}&session=${s.id}`}>{fmtDate(s.date)}</Link> },
                { label: "Present", align: "right", render: (s) => s.present_count },
                { label: "Altar call", align: "right", render: (s) => s.altar_count },
                { label: "Notes", render: (s) => s.notes ?? "" },
                { label: "Actions", render: (s) => archiveButton(s.id) },
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
