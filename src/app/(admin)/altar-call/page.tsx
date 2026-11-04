import Link from "next/link";
import { ActionButton } from "@/components/ui";
import { altarCallMonitor } from "@/lib/queries";

export const metadata = { title: "Altar Call Monitor" };

export default async function AltarCallPage() {
  const people = await altarCallMonitor();
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Altar Call Monitor</h1>
          <p className="page-sub">{people.length} people, highest streak first</p>
        </div>
      </div>
      {people.length === 0 && <section className="card"><p className="empty">Nobody has the Altar Call tag yet. Turn on Altar call while taking attendance.</p></section>}
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
            </div>
            {p.open_priority_follow_up ? (
              <ActionButton path={`/api/follow-ups/${p.open_priority_follow_up}`} method="PUT" body={{ status: "done" }}>Mark follow-up done</ActionButton>
            ) : (
              <ActionButton path="/api/follow-ups" body={{ person_id: p.id, reason: "altar_call" }}>New follow-up</ActionButton>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
