import Link from "next/link";
import { AutoSelect } from "@/components/AutoSelect";
import { fmtDate } from "@/components/format";
import { ActionButton, ApiForm, SheetButton } from "@/components/ui";
import { altarCallMonitor, recentSessions } from "@/lib/queries";

export const metadata = { title: "Altar Call" };

export default async function AltarCallPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sessions = await recentSessions();
  const session = sessions.find((s) => s.id === sp.session) ?? sessions[0];
  const people = await altarCallMonitor(session?.id ?? null);
  const serviceOptions = sessions.map((s) => ({ value: s.id, label: `${fmtDate(s.date)}, ${s.program_name}` }));

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Altar Call</h1>
          <p className="page-sub">{people.length} {people.length === 1 ? "person" : "people"}, highest streak first</p>
        </div>
        {session && (
          <SheetButton label="Add person" title="Add altar call person" className="btn primary">
            <ApiForm
              path="/api/altar-call"
              submitLabel="Add person"
              fields={[
                { name: "session_id", label: "Service", type: "select", required: true, defaultValue: session.id, options: serviceOptions },
                { name: "full_name", label: "Full name", required: true },
                { name: "phone", label: "Phone", type: "tel" },
                { name: "email", label: "Email", type: "email" },
                { name: "gender", label: "Gender", type: "select", options: [{ value: "", label: "Not given" }, { value: "Male", label: "Male" }, { value: "Female", label: "Female" }] },
                { name: "address", label: "Address", type: "textarea" },
              ]}
            />
          </SheetButton>
        )}
      </div>

      {!session && (
        <section className="card">
          <p className="empty">No services yet. <Link href="/attendance">Start today&apos;s service</Link> first, then add people here.</p>
        </section>
      )}

      {session && people.length > 0 && (
        <form method="get" className="filters" style={{ marginBottom: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <AutoSelect name="session" defaultValue={session.id} aria-label="Service to mark" style={{ backgroundColor: "var(--fill-2)" }}>
            {serviceOptions.map((o) => <option key={o.value} value={o.value}>Who came: {o.label}</option>)}
          </AutoSelect>
        </form>
      )}

      {session && people.length === 0 && <section className="card"><p className="empty">Nobody yet. Use Add person for each person who comes out at altar call.</p></section>}

      <div className="card-grid">
        {people.map((p) => (
          <section key={p.id} className={`card ${p.open_priority_follow_up ? "priority" : ""}`}>
            <Link href={`/people/${p.id}`}><strong>{p.full_name}</strong></Link>
            <div className="small muted">{p.phone ?? "No phone"}</div>
            <div className="row-tags" style={{ marginTop: 8, marginBottom: 12 }}>
              <span className="badge">Streak {p.streak}</span>
              <span className="badge">Sunday streak {p.sunday_streak}</span>
              {p.enrolled && <span className="badge good">Enrolled</span>}
              {p.open_priority_follow_up && <span className="badge priority">Priority follow-up open</span>}
              {p.came_forward && <span className="badge accent">Came out at this service</span>}
              {p.came && !p.came_forward && <span className="badge good">Came to this service</span>}
            </div>
            <div className="row">
              {p.came_forward ? (
                <ActionButton path={`/api/attendance/${p.mark_id}/altar-call`} body={{ altar_call: false }} confirm={`Remove the altar call for ${p.full_name} at this service?`}>Remove altar call</ActionButton>
              ) : p.came ? (
                <ActionButton path="/api/attendance" body={{ session_id: session!.id, person_id: p.id, present: false }}>Undo</ActionButton>
              ) : (
                <ActionButton className="btn sm primary" path="/api/attendance" body={{ session_id: session!.id, person_id: p.id, present: true }}>Came to this service</ActionButton>
              )}
              {p.open_priority_follow_up ? (
                <ActionButton path={`/api/follow-ups/${p.open_priority_follow_up}`} method="PUT" body={{ status: "done" }}>Mark follow-up done</ActionButton>
              ) : (
                <ActionButton path="/api/follow-ups" body={{ person_id: p.id, reason: "altar_call" }}>New follow-up</ActionButton>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
